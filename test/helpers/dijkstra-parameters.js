/** Synthetic local-test parameters, derived from the Cometa.js/cardano-c test fixtures.
 * Never used for wallet signing or network submission. Not network protocol parameters. */
import { plutusV4Costs } from '../../scripts/dijkstra-cost-model.js';

export const localParameters = {
  adaPerUtxoByte: 4310,
  collateralPercent: 150,
  committeeTermLimit: 16,
  costModels: [{ language: 'PlutusV4', costs: plutusV4Costs }],
  decentralisationParam: { denominator: 2, numerator: 1 },
  drepDeposit: 19,
  drepInactivityPeriod: 20,
  drepVotingThresholds: {
    committeeNoConfidence: { denominator: 2, numerator: 1 },
    committeeNormal: { denominator: 2, numerator: 1 },
    hardForkInitiation: { denominator: 2, numerator: 1 },
    motionNoConfidence: { denominator: 2, numerator: 1 },
    ppEconomicGroup: { denominator: 2, numerator: 1 },
    ppGovernanceGroup: { denominator: 2, numerator: 1 },
    ppNetworkGroup: { denominator: 2, numerator: 1 },
    ppTechnicalGroup: { denominator: 2, numerator: 1 },
    treasuryWithdrawal: { denominator: 2, numerator: 1 },
    updateConstitution: { denominator: 2, numerator: 1 }
  },
  executionCosts: {
    memory: { denominator: 10000, numerator: 577 },
    steps: { denominator: 10000000, numerator: 721 }
  },
  expansionRate: { denominator: 2, numerator: 1 },
  extraEntropy: null,
  governanceActionDeposit: 18,
  governanceActionValidityPeriod: 17,
  keyDeposit: 6,
  maxBlockBodySize: 3,
  maxBlockExUnits: {
    memory: 14000000,
    steps: 10000000000
  },
  maxBlockHeaderSize: 5,
  maxCollateralInputs: 14,
  maxEpoch: 8,
  maxTxExUnits: {
    memory: 14000000,
    steps: 10000000000
  },
  maxTxSize: 16384,
  maxValueSize: 5000,
  minCommitteeSize: 15,
  minFeeA: 44,
  minFeeB: 155381,
  minPoolCost: 10,
  nOpt: 9,
  poolDeposit: 7,
  poolPledgeInfluence: { denominator: 2, numerator: 1 },
  poolVotingThresholds: {
    committeeNoConfidence: { denominator: 2, numerator: 1 },
    committeeNormal: { denominator: 2, numerator: 1 },
    hardForkInitiation: { denominator: 2, numerator: 1 },
    motionNoConfidence: { denominator: 2, numerator: 1 },
    securityRelevantParamVotingThreshold: { denominator: 2, numerator: 1 }
  },
  protocolVersion: { major: 12, minor: 0 },
  refScriptCostPerByte: { denominator: 2, numerator: 1 },
  treasuryGrowthRate: { denominator: 2, numerator: 1 }
};
