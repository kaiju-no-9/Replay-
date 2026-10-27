import fs from 'node:fs';
import path from 'node:path';
import {GroundTruthSchema,EvaluationRunRecordSchema,EvaluationRunRecord} from './types.js';

/** Evaluator-only component. Never register it as an investigator or agent tool/API. */
export class EvaluatorService {
  constructor(private readonly groundTruthDirectory=path.resolve(process.cwd(),process.cwd().endsWith('/apps/runtime')?'../../tests/evaluation/ground-truth':'tests/evaluation/ground-truth')){}
  evaluate(record:EvaluationRunRecord,scenarioFile:string):{record:EvaluationRunRecord;matchedScenario:boolean;groundTruthLabel:string} {
    const safe=path.basename(scenarioFile);
    if(safe!==scenarioFile||!safe.endsWith('.json'))throw new Error('Invalid evaluator scenario filename');
    const full=path.resolve(this.groundTruthDirectory,safe);
    if(!full.startsWith(`${path.resolve(this.groundTruthDirectory)}${path.sep}`))throw new Error('Ground-truth path escaped evaluator directory');
    const truth=GroundTruthSchema.parse(JSON.parse(fs.readFileSync(full,'utf8')));
    const checked=EvaluationRunRecordSchema.parse(record);
    if(checked.scenarioId!==truth.scenarioId)throw new Error('Evaluation scenario does not match ground truth');
    const matched=checked.investigation.rootCauseMatched&&truth.requiredEvidenceKeys.length>0&&checked.investigation.evidenceCoverage>=1;
    return {record:checked,matchedScenario:matched,groundTruthLabel:truth.secretLabel};
  }
}
