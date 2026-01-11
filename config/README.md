# Configuration Directory

This directory contains all configuration files for the FuelSense 360 multi-agent platform.

## Structure

- `agents/` - Agent configuration files defining agent capabilities, tools, and behavior
- `tools/` - Tool configuration files mapping tools to their implementations
- `workflows/` - Workflow definitions for orchestrating multi-agent interactions
- `prompts/` - Prompt templates for agents and system messages
- `business-rules/` - Business logic rules and constraints
- `features/` - Feature flags and feature-specific configurations

## Purpose

The configuration-driven approach allows for:
- Easy addition of new agents without code changes
- Centralized management of agent capabilities
- Dynamic workflow composition
- A/B testing of prompts and behaviors
- Business rule updates without deployments

