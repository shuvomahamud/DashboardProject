import { describe, expect, it } from '@jest/globals';
import {
  evaluateSkillRequirements,
  parseManualSkillAssessments,
  parseAiSkillExperience,
  parseSkillRequirementConfig
} from '../skillRequirements';

describe('skillRequirements helpers', () => {
  it('parses skill requirement config from various shapes', () => {
    const fromArray = parseSkillRequirementConfig([
      { skill: 'React', requiredMonths: 24 },
      { skill: 'Node.js', requiredMonths: '12' }
    ]);
    expect(fromArray).toHaveLength(2);
    expect(fromArray[0].skill).toBe('React');
    expect(fromArray[1].requiredMonths).toBe(12);

    const fromObject = parseSkillRequirementConfig({ SQL: 18, 'Data Analysis': 0 });
    expect(fromObject).toHaveLength(2);
    expect(fromObject.find(item => item.skill === 'SQL')?.requiredMonths).toBe(18);
  });

  it('evaluates mandatory skills using manual and AI evidence', () => {
    const requirements = parseSkillRequirementConfig([
      { skill: 'React', requiredMonths: 24 },
      { skill: 'Node.js', requiredMonths: 0 },
      { skill: 'PostgreSQL', requiredMonths: 12 }
    ]);

    const manualAssessments = parseManualSkillAssessments([
      { skill: 'React', months: 18 },
      { skill: 'node js', months: null }
    ]);

    const aiExperiences = parseAiSkillExperience([
      { skill: 'React', months: 30 },
      { skill: 'PostgreSQL', months: 10 },
      { skill: 'Node.js', months: 6 }
    ]);

    const summary = evaluateSkillRequirements(requirements, manualAssessments, aiExperiences);

    expect(summary.evaluations).toHaveLength(3);

    const reactEval = summary.evaluations.find(item => item.skill === 'React');
    expect(reactEval?.meetsRequirement).toBe(true);
    expect(reactEval?.candidateMonths).toBe(30);

    const postgresEval = summary.evaluations.find(item => item.skill === 'PostgreSQL');
    expect(postgresEval?.meetsRequirement).toBe(false);
    expect(postgresEval?.deficitMonths).toBe(2);

    expect(summary.manualCoverageMissing).toContain('PostgreSQL');
    expect(summary.aiDetectedWithoutManual).toContain('PostgreSQL');
    expect(summary.unmetRequirements).toContain('PostgreSQL');
    expect(summary.allMet).toBe(false);
  });

  it('handles empty requirements gracefully', () => {
    const summary = evaluateSkillRequirements([], [], []);
    expect(summary.evaluations).toHaveLength(0);
    expect(summary.allMet).toBe(true);
  });
});
