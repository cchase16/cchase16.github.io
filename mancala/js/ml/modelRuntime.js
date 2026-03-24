import { encodeStateForPlayer } from './stateEncoding.js';
import { cloneModelBundle, normalizeModelBundle } from './modelBundle.js';

const ILLEGAL_MOVE_LOGIT = -1e9;

export function createModelRuntime(bundle) {
  const normalizedBundle = normalizeModelBundle(bundle);
  return {
    bundle: cloneModelBundle(normalizedBundle),
    infer(inputVector, { legalMask = null } = {}) {
      return runPolicyValueModel(normalizedBundle, inputVector, { legalMask });
    },
    inferState(state, player = state.currentPlayer) {
      return inferPolicyValueForState(normalizedBundle, state, player);
    },
  };
}

export function inferPolicyValueForState(bundle, state, player = state.currentPlayer) {
  const encodedState = encodeStateForPlayer(state, player);
  return {
    encodedState,
    ...runPolicyValueModel(bundle, encodedState.inputVector, { legalMask: encodedState.legalMask }),
  };
}

export function runPolicyValueModel(bundle, inputVector, { legalMask = null } = {}) {
  const normalizedBundle = normalizeModelBundle(bundle);
  const normalizedInput = normalizeInputVector(inputVector, normalizedBundle.architecture.inputLength);
  let activations = normalizedInput;

  for (const layer of normalizedBundle.hiddenLayers) {
    activations = applyDenseLayer(activations, layer);
  }

  const policyLogits = applyDenseLayer(activations, normalizedBundle.policyHead);
  const maskedPolicyLogits = maskPolicyLogits(policyLogits, legalMask);
  const policyProbabilities = softmax(maskedPolicyLogits);
  const rankedMoves = rankMoves(policyProbabilities, maskedPolicyLogits);
  const valueVector = applyDenseLayer(activations, normalizedBundle.valueHead);

  return {
    inputVector: normalizedInput,
    hiddenVector: activations,
    policyLogits,
    maskedPolicyLogits,
    policyProbabilities,
    rankedMoves,
    value: valueVector[0] ?? 0,
  };
}

export function applyDenseLayer(inputVector, layer) {
  const output = [];
  for (let rowIndex = 0; rowIndex < layer.outputSize; rowIndex += 1) {
    let sum = layer.bias[rowIndex] ?? 0;
    const weights = layer.weights[rowIndex] ?? [];
    for (let columnIndex = 0; columnIndex < layer.inputSize; columnIndex += 1) {
      sum += (weights[columnIndex] ?? 0) * (inputVector[columnIndex] ?? 0);
    }
    output.push(applyActivation(sum, layer.activation));
  }
  return output;
}

export function maskPolicyLogits(policyLogits, legalMask = null) {
  if (!legalMask) return [...policyLogits];
  return policyLogits.map((value, index) => (legalMask[index] ? value : ILLEGAL_MOVE_LOGIT));
}

export function softmax(values) {
  if (!values.length) return [];
  const finiteValues = values.filter((value) => Number.isFinite(value) && value > ILLEGAL_MOVE_LOGIT / 2);
  if (!finiteValues.length) return values.map(() => 0);

  const maxValue = Math.max(...finiteValues);
  const exponentials = values.map((value) => {
    if (!Number.isFinite(value) || value <= ILLEGAL_MOVE_LOGIT / 2) return 0;
    return Math.exp(value - maxValue);
  });
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);
  return exponentials.map((value) => value / total);
}

function rankMoves(policyProbabilities, maskedPolicyLogits) {
  return policyProbabilities
    .map((probability, index) => ({
      localPitIndex: index,
      probability,
      logit: maskedPolicyLogits[index] ?? 0,
    }))
    .filter((entry) => entry.probability > 0)
    .sort((left, right) => right.probability - left.probability || right.logit - left.logit);
}

function normalizeInputVector(inputVector, expectedLength) {
  if (!Array.isArray(inputVector)) {
    throw new Error('Input vector must be an array.');
  }
  if (inputVector.length !== expectedLength) {
    throw new Error(`Expected input vector of length ${expectedLength}, received ${inputVector.length}.`);
  }
  return inputVector.map((value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  });
}

function applyActivation(value, activation = 'linear') {
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
