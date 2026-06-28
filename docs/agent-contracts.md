# Agent Contracts

All contracts are Pydantic models in `backend/app/models/agent.py`.

## Orchestrator

Input: `EventLaunchRequest`.

Output: `LaunchPackage`.

Memory behavior: writes final summarized package to `event_templates`.

## Research

Input: event brief.

Output: `ResearchOutput`.

Memory behavior: reads `event_templates` and `sponsor_templates`; writes research and sponsor summaries.

## Branding

Input: event brief and research output.

Output: `BrandingOutput`.

Memory behavior: reads event/campaign memories to avoid stale naming; writes brand system to `marketing_assets`.

## Content

Input: brief, research, branding.

Output: `ContentOutput`.

Memory behavior: reads reusable marketing assets; writes landing/outreach summary.

## Social Media

Input: brief, branding, content.

Output: `SocialMediaOutput`.

Memory behavior: writes campaign pattern to `campaign_history`.

## Operations

Input: brief, research, branding.

Output: `OperationsOutput`.

Memory behavior: writes operations plan summary to `event_templates`.

## Critic

Input: all sub-agent outputs.

Output: `CriticReviewOutput`.

Memory behavior: no long-term writes in MVP.
