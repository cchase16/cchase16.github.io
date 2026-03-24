import { POLICY_INPUT_LENGTH, POLICY_VALUE_ENCODING_VERSION } from './stateEncoding.js';

export const POLICY_VALUE_MODEL_FORMAT = 'mancala-policy-value-model-v1';
export const POLICY_VALUE_MODEL_TYPE = 'policy-value-search';
export const POLICY_HEAD_SIZE = 6;
export const VALUE_HEAD_SIZE = 1;

const DEFAULT_HIDDEN_LAYER_SIZES = [64, 64, 32];

export function createModelBundle({
  id = 'starter-policy-value-model',
  name = 'Starter Policy Value Model',
  inputLength = POLICY_INPUT_LENGTH,
  hiddenLayerSizes = DEFAULT_HIDDEN_LAYER_SIZES,
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  trainingMetadata = {},
} = {}) {
  const hiddenLayers = [];
  let previousSize = inputLength;
  for (const layerSize of hiddenLayerSizes) {
    hiddenLayers.push(createDenseLayer({
      inputSize: previousSize,
      outputSize: layerSize,
      activation: 'relu',
    }));
    previousSize = layerSize;
  }

  return normalizeModelBundle({
    version: 1,
    format: POLICY_VALUE_MODEL_FORMAT,
    modelType: POLICY_VALUE_MODEL_TYPE,
    id,
    name,
    encodingVersion: POLICY_VALUE_ENCODING_VERSION,
    createdAt,
    updatedAt,
    architecture: {
      inputLength,
      hiddenLayerSizes: [...hiddenLayerSizes],
      policySize: POLICY_HEAD_SIZE,
      valueSize: VALUE_HEAD_SIZE,
      hiddenActivation: 'relu',
      policyActivation: 'linear',
      valueActivation: 'tanh',
    },
    hiddenLayers,
    policyHead: createDenseLayer({
      inputSize: previousSize,
      outputSize: POLICY_HEAD_SIZE,
      activation: 'linear',
    }),
    valueHead: createDenseLayer({
      inputSize: previousSize,
      outputSize: VALUE_HEAD_SIZE,
      activation: 'tanh',
    }),
    trainingMetadata: {
      gamesSeen: 0,
      datasetFormat: null,
      datasetPath: null,
      searchDepth: null,
      notes: '',
      ...trainingMetadata,
    },
  });
}

export function createDenseLayer({ inputSize, outputSize, activation = 'linear', fill = null, weights = null, bias = null }) {
  const safeInputSize = Math.max(1, Math.floor(Number(inputSize) || 1));
  const safeOutputSize = Math.max(1, Math.floor(Number(outputSize) || 1));
  const normalizedWeights = weights
    ? normalizeMatrix(weights, safeOutputSize, safeInputSize)
    : Array.from({ length: safeOutputSize }, (_, rowIndex) => Array.from(
      { length: safeInputSize },
      (_, columnIndex) => (fill == null
        ? deterministicWeightInitializer({ rowIndex, columnIndex, inputSize: safeInputSize, outputSize: safeOutputSize })
        : fill),
    ));
  const normalizedBias = bias
    ? normalizeVector(bias, safeOutputSize)
    : Array.from({ length: safeOutputSize }, () => 0);

  return {
    inputSize: safeInputSize,
    outputSize: safeOutputSize,
    activation,
    weights: normalizedWeights,
    bias: normalizedBias,
  };
}

export function cloneModelBundle(bundle) {
  return JSON.parse(JSON.stringify(normalizeModelBundle(bundle)));
}

export function normalizeModelBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('Model bundle must be an object.');
  }

  const inputLength = Math.max(1, Math.floor(Number(bundle.architecture?.inputLength) || POLICY_INPUT_LENGTH));
  const hiddenLayerSizes = Array.isArray(bundle.architecture?.hiddenLayerSizes)
    ? bundle.architecture.hiddenLayerSizes.map((size) => Math.max(1, Math.floor(Number(size) || 1)))
    : [...DEFAULT_HIDDEN_LAYER_SIZES];

  const hiddenLayers = [];
  let previousSize = inputLength;
  const sourceHiddenLayers = Array.isArray(bundle.hiddenLayers) ? bundle.hiddenLayers : [];
  for (let index = 0; index < hiddenLayerSizes.length; index += 1) {
    const outputSize = hiddenLayerSizes[index];
    hiddenLayers.push(createDenseLayer({
      inputSize: previousSize,
      outputSize,
      activation: sourceHiddenLayers[index]?.activation ?? bundle.architecture?.hiddenActivation ?? 'relu',
      weights: sourceHiddenLayers[index]?.weights,
      bias: sourceHiddenLayers[index]?.bias,
    }));
    previousSize = outputSize;
  }

  return {
    version: Math.max(1, Math.floor(Number(bundle.version) || 1)),
    format: bundle.format ?? POLICY_VALUE_MODEL_FORMAT,
    modelType: bundle.modelType ?? POLICY_VALUE_MODEL_TYPE,
    id: String(bundle.id ?? 'policy-value-model'),
    name: String(bundle.name ?? 'Policy Value Model'),
    encodingVersion: bundle.encodingVersion ?? POLICY_VALUE_ENCODING_VERSION,
    createdAt: bundle.createdAt ?? new Date().toISOString(),
    updatedAt: bundle.updatedAt ?? bundle.createdAt ?? new Date().toISOString(),
    architecture: {
      inputLength,
      hiddenLayerSizes,
      policySize: POLICY_HEAD_SIZE,
      valueSize: VALUE_HEAD_SIZE,
      hiddenActivation: bundle.architecture?.hiddenActivation ?? 'relu',
      policyActivation: bundle.architecture?.policyActivation ?? 'linear',
      valueActivation: bundle.architecture?.valueActivation ?? 'tanh',
    },
    hiddenLayers,
    policyHead: createDenseLayer({
      inputSize: previousSize,
      outputSize: POLICY_HEAD_SIZE,
      activation: bundle.policyHead?.activation ?? bundle.architecture?.policyActivation ?? 'linear',
      weights: bundle.policyHead?.weights,
      bias: bundle.policyHead?.bias,
    }),
    valueHead: createDenseLayer({
      inputSize: previousSize,
      outputSize: VALUE_HEAD_SIZE,
      activation: bundle.valueHead?.activation ?? bundle.architecture?.valueActivation ?? 'tanh',
      weights: bundle.valueHead?.weights,
      bias: bundle.valueHead?.bias,
    }),
    trainingMetadata: {
      gamesSeen: Number(bundle.trainingMetadata?.gamesSeen) || 0,
      datasetFormat: bundle.trainingMetadata?.datasetFormat ?? null,
      datasetPath: bundle.trainingMetadata?.datasetPath ?? null,
      searchDepth: Number.isFinite(Number(bundle.trainingMetadata?.searchDepth))
        ? Math.max(1, Math.floor(Number(bundle.trainingMetadata.searchDepth)))
        : null,
      notes: bundle.trainingMetadata?.notes ?? '',
      lastSupervisedTrainingRun: bundle.trainingMetadata?.lastSupervisedTrainingRun ?? null,
      lastLeagueTrainingRun: bundle.trainingMetadata?.lastLeagueTrainingRun ?? null,
    },
  };
}

export function serializeModelBundle(bundle) {
  return JSON.stringify(normalizeModelBundle(bundle), null, 2);
}

export function parseModelBundleJson(text) {
  return normalizeModelBundle(JSON.parse(text));
}

function normalizeMatrix(matrix, rows, cols) {
  if (!Array.isArray(matrix)) {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  }

  return Array.from({ length: rows }, (_, rowIndex) => {
    const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
    return normalizeVector(row, cols);
  });
}

function normalizeVector(vector, length) {
  if (!Array.isArray(vector)) {
    return Array.from({ length }, () => 0);
  }

  return Array.from({ length }, (_, index) => {
    const value = Number(vector[index]);
    return Number.isFinite(value) ? value : 0;
  });
}

function deterministicWeightInitializer({ rowIndex, columnIndex, inputSize, outputSize }) {
  const scale = Math.sqrt(2 / Math.max(1, inputSize + outputSize));
  const wave = Math.sin((rowIndex + 1) * 12.9898 + (columnIndex + 1) * 78.233 + inputSize * 0.137 + outputSize * 0.193);
  return wave * scale;
}
