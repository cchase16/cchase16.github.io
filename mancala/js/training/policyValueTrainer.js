import { cloneModelBundle, normalizeModelBundle } from '../ml/modelBundle.js';
import { createSeededRng } from '../utils/rng.js';

const DEFAULT_OPTIONS = {
  epochs: 12,
  batchSize: 32,
  learningRate: 0.02,
  policyLossWeight: 1,
  valueLossWeight: 0.5,
  l2Regularization: 0.0001,
  shuffleSeed: 1,
};

export function trainPolicyValueModel({ modelBundle, dataset, options = {} }) {
  const config = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const model = cloneModelBundle(normalizeModelBundle(modelBundle));
  const normalizedDataset = normalizeDataset(dataset, model.architecture.inputLength);
  if (!normalizedDataset.samples.length) {
    throw new Error('Dataset must contain at least one sample.');
  }

  const rng = createSeededRng(config.shuffleSeed);
  const history = [];

  for (let epoch = 0; epoch < Math.max(1, Math.floor(config.epochs)); epoch += 1) {
    const shuffled = shuffleSamples(normalizedDataset.samples, rng);
    const epochMetrics = {
      epoch: epoch + 1,
      samples: shuffled.length,
      policyLoss: 0,
      valueLoss: 0,
      totalLoss: 0,
      policyAccuracy: 0,
    };
    let correctPredictions = 0;

    for (let batchStart = 0; batchStart < shuffled.length; batchStart += config.batchSize) {
      const batch = shuffled.slice(batchStart, batchStart + config.batchSize);
      const gradients = createGradientAccumulator(model);

      for (const sample of batch) {
        const sampleMetrics = accumulateSampleGradients(model, sample, gradients, config);
        epochMetrics.policyLoss += sampleMetrics.policyLoss;
        epochMetrics.valueLoss += sampleMetrics.valueLoss;
        epochMetrics.totalLoss += sampleMetrics.totalLoss;
        correctPredictions += sampleMetrics.correctPrediction ? 1 : 0;
      }

      applyGradients(model, gradients, config.learningRate, batch.length, config.l2Regularization);
    }

    epochMetrics.policyAccuracy = correctPredictions / shuffled.length;
    epochMetrics.policyLoss /= shuffled.length;
    epochMetrics.valueLoss /= shuffled.length;
    epochMetrics.totalLoss /= shuffled.length;
    history.push(epochMetrics);
  }

  model.updatedAt = new Date().toISOString();
  model.trainingMetadata = {
    ...model.trainingMetadata,
    gamesSeen: Number(model.trainingMetadata.gamesSeen || 0) + Number(normalizedDataset.metadata.games || 0),
    datasetFormat: normalizedDataset.metadata.format ?? model.trainingMetadata.datasetFormat ?? null,
    datasetPath: normalizedDataset.metadata.path ?? model.trainingMetadata.datasetPath ?? null,
    notes: buildTrainingNotes(config, history.at(-1)),
    lastSupervisedTrainingRun: {
      epochs: config.epochs,
      batchSize: config.batchSize,
      learningRate: config.learningRate,
      policyLossWeight: config.policyLossWeight,
      valueLossWeight: config.valueLossWeight,
      l2Regularization: config.l2Regularization,
      sampleCount: normalizedDataset.samples.length,
      completedAt: model.updatedAt,
    },
  };

  return {
    modelBundle: model,
    history,
    finalMetrics: history.at(-1) ?? null,
  };
}

export function evaluatePolicyValueDataset(modelBundle, dataset) {
  const model = normalizeModelBundle(modelBundle);
  const normalizedDataset = normalizeDataset(dataset, model.architecture.inputLength);
  const metrics = {
    samples: normalizedDataset.samples.length,
    policyLoss: 0,
    valueLoss: 0,
    totalLoss: 0,
    policyAccuracy: 0,
  };
  let correct = 0;

  for (const sample of normalizedDataset.samples) {
    const forward = forwardPass(model, sample.inputVector);
    const policy = maskedSoftmax(forward.policyLogits, sample.legalMask);
    const targetIndex = sample.teacherMoveLocalIndex;
    const predictedIndex = argMax(policy);
    const targetProbability = Math.max(policy[targetIndex] ?? 0, 1e-9);
    const valuePrediction = forward.valueOutput[0] ?? 0;
    const valueError = valuePrediction - sample.outcomeForCurrentPlayer;
    const policyLoss = -Math.log(targetProbability);
    const valueLoss = 0.5 * valueError * valueError;

    metrics.policyLoss += policyLoss;
    metrics.valueLoss += valueLoss;
    metrics.totalLoss += policyLoss + valueLoss;
    if (predictedIndex === targetIndex) correct += 1;
  }

  if (metrics.samples > 0) {
    metrics.policyLoss /= metrics.samples;
    metrics.valueLoss /= metrics.samples;
    metrics.totalLoss /= metrics.samples;
    metrics.policyAccuracy = correct / metrics.samples;
  }

  return metrics;
}

function accumulateSampleGradients(model, sample, gradients, config) {
  const forward = forwardPass(model, sample.inputVector);
  const policy = maskedSoftmax(forward.policyLogits, sample.legalMask);
  const predictedPolicyIndex = argMax(policy);
  const policyGradient = policy.map((probability, index) => {
    if (!sample.legalMask[index]) return 0;
    return (probability - (index === sample.teacherMoveLocalIndex ? 1 : 0)) * config.policyLossWeight;
  });

  const valuePrediction = forward.valueOutput[0] ?? 0;
  const valueError = valuePrediction - sample.outcomeForCurrentPlayer;
  const valueGradient = [valueError * tanhDerivativeFromOutput(valuePrediction) * config.valueLossWeight];

  accumulateDenseGradients(gradients.policyHead, forward.hiddenOutput, policyGradient);
  accumulateDenseGradients(gradients.valueHead, forward.hiddenOutput, valueGradient);

  let hiddenDelta = combineHeadBackprop(model, policyGradient, valueGradient);
  for (let layerIndex = model.hiddenLayers.length - 1; layerIndex >= 0; layerIndex -= 1) {
    const layer = model.hiddenLayers[layerIndex];
    const layerInput = layerIndex === 0 ? sample.inputVector : forward.hiddenActivations[layerIndex - 1];
    const activatedOutput = forward.hiddenActivations[layerIndex];
    const layerDelta = hiddenDelta.map((delta, neuronIndex) => delta * reluDerivativeFromOutput(activatedOutput[neuronIndex]));
    accumulateDenseGradients(gradients.hiddenLayers[layerIndex], layerInput, layerDelta);

    if (layerIndex > 0) {
      hiddenDelta = backpropagateDense(layer, layerDelta);
    }
  }

  const targetProbability = Math.max(policy[sample.teacherMoveLocalIndex] ?? 0, 1e-9);
  const policyLoss = -Math.log(targetProbability);
  const valueLoss = 0.5 * valueError * valueError;

  return {
    policyLoss,
    valueLoss,
    totalLoss: policyLoss * config.policyLossWeight + valueLoss * config.valueLossWeight,
    correctPrediction: predictedPolicyIndex === sample.teacherMoveLocalIndex,
  };
}

function forwardPass(model, inputVector) {
  let current = inputVector;
  const hiddenActivations = [];

  for (const layer of model.hiddenLayers) {
    const output = denseForward(layer, current);
    hiddenActivations.push(output);
    current = output;
  }

  const policyLogits = denseForward(model.policyHead, current);
  const valueOutput = denseForward(model.valueHead, current);

  return {
    hiddenActivations,
    hiddenOutput: current,
    policyLogits,
    valueOutput,
  };
}

function denseForward(layer, input) {
  const output = [];
  for (let rowIndex = 0; rowIndex < layer.outputSize; rowIndex += 1) {
    let sum = layer.bias[rowIndex] ?? 0;
    const weights = layer.weights[rowIndex] ?? [];
    for (let columnIndex = 0; columnIndex < layer.inputSize; columnIndex += 1) {
      sum += (weights[columnIndex] ?? 0) * (input[columnIndex] ?? 0);
    }
    output.push(applyActivation(sum, layer.activation));
  }
  return output;
}

function createGradientAccumulator(model) {
  return {
    hiddenLayers: model.hiddenLayers.map((layer) => zeroLikeLayer(layer)),
    policyHead: zeroLikeLayer(model.policyHead),
    valueHead: zeroLikeLayer(model.valueHead),
  };
}

function zeroLikeLayer(layer) {
  return {
    weights: layer.weights.map((row) => row.map(() => 0)),
    bias: layer.bias.map(() => 0),
  };
}

function accumulateDenseGradients(gradientLayer, input, delta) {
  for (let rowIndex = 0; rowIndex < gradientLayer.bias.length; rowIndex += 1) {
    gradientLayer.bias[rowIndex] += delta[rowIndex] ?? 0;
    for (let columnIndex = 0; columnIndex < gradientLayer.weights[rowIndex].length; columnIndex += 1) {
      gradientLayer.weights[rowIndex][columnIndex] += (delta[rowIndex] ?? 0) * (input[columnIndex] ?? 0);
    }
  }
}

function combineHeadBackprop(model, policyGradient, valueGradient) {
  const hiddenSize = model.hiddenLayers.at(-1)?.outputSize ?? model.architecture.inputLength;
  const hiddenDelta = Array.from({ length: hiddenSize }, () => 0);

  for (let outputIndex = 0; outputIndex < model.policyHead.outputSize; outputIndex += 1) {
    for (let hiddenIndex = 0; hiddenIndex < hiddenSize; hiddenIndex += 1) {
      hiddenDelta[hiddenIndex] += (model.policyHead.weights[outputIndex][hiddenIndex] ?? 0) * (policyGradient[outputIndex] ?? 0);
    }
  }

  for (let outputIndex = 0; outputIndex < model.valueHead.outputSize; outputIndex += 1) {
    for (let hiddenIndex = 0; hiddenIndex < hiddenSize; hiddenIndex += 1) {
      hiddenDelta[hiddenIndex] += (model.valueHead.weights[outputIndex][hiddenIndex] ?? 0) * (valueGradient[outputIndex] ?? 0);
    }
  }

  return hiddenDelta;
}

function backpropagateDense(layer, delta) {
  const previousDelta = Array.from({ length: layer.inputSize }, () => 0);
  for (let rowIndex = 0; rowIndex < layer.outputSize; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < layer.inputSize; columnIndex += 1) {
      previousDelta[columnIndex] += (layer.weights[rowIndex][columnIndex] ?? 0) * (delta[rowIndex] ?? 0);
    }
  }
  return previousDelta;
}

function applyGradients(model, gradients, learningRate, batchSize, l2Regularization) {
  const scale = learningRate / Math.max(1, batchSize);
  for (let layerIndex = 0; layerIndex < model.hiddenLayers.length; layerIndex += 1) {
    applyLayerGradient(model.hiddenLayers[layerIndex], gradients.hiddenLayers[layerIndex], scale, l2Regularization);
  }
  applyLayerGradient(model.policyHead, gradients.policyHead, scale, l2Regularization);
  applyLayerGradient(model.valueHead, gradients.valueHead, scale, l2Regularization);
}

function applyLayerGradient(layer, gradientLayer, scale, l2Regularization) {
  for (let rowIndex = 0; rowIndex < layer.outputSize; rowIndex += 1) {
    layer.bias[rowIndex] -= scale * gradientLayer.bias[rowIndex];
    for (let columnIndex = 0; columnIndex < layer.inputSize; columnIndex += 1) {
      const l2Penalty = layer.weights[rowIndex][columnIndex] * l2Regularization;
      layer.weights[rowIndex][columnIndex] -= scale * (gradientLayer.weights[rowIndex][columnIndex] + l2Penalty);
    }
  }
}

function maskedSoftmax(logits, legalMask) {
  const masked = logits.map((value, index) => (legalMask[index] ? value : -1e9));
  const maxValue = Math.max(...masked.filter((value) => value > -1e8));
  const exps = masked.map((value) => (value <= -1e8 ? 0 : Math.exp(value - maxValue)));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => (total > 0 ? value / total : 0));
}

function normalizeDataset(dataset, inputLength) {
  if (!dataset || typeof dataset !== 'object' || !Array.isArray(dataset.samples)) {
    throw new Error('Training dataset must be an object with a samples array.');
  }

  return {
    metadata: dataset.metadata ?? {},
    samples: dataset.samples
      .map((sample) => normalizeSample(sample, inputLength))
      .filter(Boolean),
  };
}

function normalizeSample(sample, inputLength) {
  if (!sample || !Array.isArray(sample.inputVector) || sample.inputVector.length !== inputLength) {
    return null;
  }

  const teacherMoveLocalIndex = Math.max(0, Math.min(5, Math.floor(Number(sample.teacherMoveLocalIndex) || 0)));
  const legalMask = Array.from({ length: 6 }, (_, index) => (sample.legalMask?.[index] ? 1 : 0));
  if (!legalMask[teacherMoveLocalIndex]) return null;

  return {
    inputVector: sample.inputVector.map((value) => Number(value) || 0),
    legalMask,
    teacherMoveLocalIndex,
    outcomeForCurrentPlayer: clampSigned(Number(sample.outcomeForCurrentPlayer) || 0),
  };
}

function clampSigned(value) {
  return Math.max(-1, Math.min(1, value));
}

function shuffleSamples(samples, rng) {
  const copy = [...samples];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function applyActivation(value, activation) {
  switch (activation) {
    case 'relu':
      return Math.max(0, value);
    case 'tanh':
      return Math.tanh(value);
    case 'linear':
    default:
      return value;
  }
}

function reluDerivativeFromOutput(output) {
  return output > 0 ? 1 : 0;
}

function tanhDerivativeFromOutput(output) {
  return 1 - output * output;
}

function argMax(values) {
  let bestIndex = 0;
  let bestValue = -Infinity;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] > bestValue) {
      bestValue = values[index];
      bestIndex = index;
    }
  }
  return bestIndex;
}

function buildTrainingNotes(config, finalMetrics) {
  if (!finalMetrics) return 'Supervised training completed.';
  return `Supervised training completed with lr=${config.learningRate}, epochs=${config.epochs}, policyAcc=${finalMetrics.policyAccuracy.toFixed(3)}, totalLoss=${finalMetrics.totalLoss.toFixed(4)}.`;
}
