import { describe, expect, it } from '@jest/globals';
import {
  evaluateSkillRequirements,
  parseManualSkillAssessments,
  parseAiSkillExperience,
  parseSkillRequirementConfig
} from '../skillRequirements';

describe('skillRequirements helpers', () => {
  it('parses skill requirement config from arrays and JSON strings', () => {
    const fromArray = parseSkillRequirementConfig(['React', 'Node.js']);
    expect(fromArray).toHaveLength(2);
    expect(fromArray[0].skill).toBe('React');
    expect(fromArray[0].canonical).toBe('react');

    const fromString = parseSkillRequirementConfig(
      JSON.stringify(['SQL', 'Data Analysis'])
    );
    expect(fromString).toHaveLength(2);
    expect(fromString.find(item => item.skill === 'SQL')).toBeTruthy();
  });

  it('evaluates mandatory skills using manual and AI evidence', () => {
    const requirements = parseSkillRequirementConfig(['React', 'Node.js', 'PostgreSQL', 'Azure']);

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

    expect(summary.evaluations).toHaveLength(4);

    const reactEval = summary.evaluations.find(item => item.skill === 'React');
    expect(reactEval?.matched).toBe(true);

    const postgresEval = summary.evaluations.find(item => item.skill === 'PostgreSQL');
    expect(postgresEval?.matched).toBe(true);

    const azureEval = summary.evaluations.find(item => item.skill === 'Azure');
    expect(azureEval?.matched).toBe(false);

    expect(summary.manualCoverageMissing).toContain('PostgreSQL');
    expect(summary.aiDetectedWithoutManual).toContain('PostgreSQL');
    expect(summary.unmetRequirements).toContain('Azure');
    expect(summary.metRequirements).toContain('React');
    expect(summary.metRequirements).toContain('PostgreSQL');
    expect(summary.allMet).toBe(false);
  });

  it('handles empty requirements gracefully', () => {
    const summary = evaluateSkillRequirements([], [], []);
    expect(summary.evaluations).toHaveLength(0);
    expect(summary.allMet).toBe(true);
  });
});
