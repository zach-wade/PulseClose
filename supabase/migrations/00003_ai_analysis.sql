-- Add AI analysis column to borrower_validations
alter table borrower_validations
  add column ai_analysis jsonb default null;

comment on column borrower_validations.ai_analysis is
  'Structured AI-generated analysis: { summary, risk_rating, pillar_assessments, flags, recommendations }';
