#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import {
  getEventTypeAndContext,
  generatePrompt,
  generateDefaultPrompt,
} from "../src/create-prompt";
import type { PreparedContext } from "../src/create-prompt";
import type { Mode } from "../src/modes/types";
import { createMockContext } from "./mockContext";
import type { PullRequestEvent } from "@octokit/webhooks-types";

describe("pull_request_target event support", () => {
  // Create a mock tag mode for testing
  const mockTagMode: Mode = {
    name: "tag",
    description: "Tag mode",
    shouldTrigger: () => true,
    prepareContext: (context) => ({ mode: "tag", githubContext: context }),
    getAllowedTools: () => [],
    getDisallowedTools: () => [],
    shouldCreateTrackingComment: () => true,
    generatePrompt: (context, githubData, useCommitSigning) =>
      generateDefaultPrompt(context, githubData, useCommitSigning),
    prepare: async () => ({
      commentId: 123,
      branchInfo: {
        baseBranch: "main",
        currentBranch: "main",
        claudeBranch: undefined,
      },
      mcpConfig: "{}",
    }),
  };

  const mockGitHubData = {
    contextData: {
      title: "Test PR Target",
      body: "This is a test pull request target",
      author: { login: "external-contributor" },
      state: "OPEN",
      createdAt: "2023-01-01T00:00:00Z",
      additions: 20,
      deletions: 5,
      baseRefName: "main",
      headRefName: "external-feature",
      headRefOid: "def456",
      commits: {
        totalCount: 1,
        nodes: [
          {
            commit: {
              oid: "commit2",
              message: "Add external feature",
              author: {
                name: "External Contributor",
                email: "external@example.com",
              },
            },
          },
        ],
      },
      files: {
        nodes: [
          {
            path: "src/feature.ts",
            additions: 20,
            deletions: 5,
            changeType: "ADDED",
          },
        ],
      },
      comments: {
        nodes: [],
      },
      reviews: {
        nodes: [],
      },
    },
    comments: [],
    changedFiles: [],
    changedFilesWithSHA: [
      {
        path: "src/feature.ts",
        additions: 20,
        deletions: 5,
        changeType: "ADDED",
        sha: "def456",
      },
    ],
    reviewData: {
      nodes: [],
    },
    imageUrlMap: new Map<string, string>(),
  };

  describe("getEventTypeAndContext for pull_request_target", () => {
    test("should return PULL_REQUEST event type for pull_request_target opened", () => {
      const envVars: PreparedContext = {
        repository: "owner/repo",
        claudeCommentId: "12345",
        triggerPhrase: "@claude",
        eventData: {
          eventName: "pull_request_target",
          eventAction: "opened",
          isPR: true,
          prNumber: "123",
        },
      };

      const result = getEventTypeAndContext(envVars);

      expect(result.eventType).toBe("PULL_REQUEST");
      expect(result.triggerContext).toBe("pull request opened");
    });

    test("should return PULL_REQUEST event type for pull_request_target synchronize", () => {
      const envVars: PreparedContext = {
        repository: "owner/repo",
        claudeCommentId: "12345",
        triggerPhrase: "@claude",
        eventData: {
          eventName: "pull_request_target",
          eventAction: "synchronize",
          isPR: true,
          prNumber: "456",
        },
      };

      const result = getEventTypeAndContext(envVars);

      expect(result.eventType).toBe("PULL_REQUEST");
      expect(result.triggerContext).toBe("pull request synchronize");
    });

    test("should return PULL_REQUEST event type for pull_request_target reopened", () => {
      const envVars: PreparedContext = {
        repository: "owner/repo",
        claudeCommentId: "12345",
        triggerPhrase: "@claude",
        eventData: {
          eventName: "pull_request_target",
          eventAction: "reopened",
          isPR: true,
          prNumber: "789",
        },
      };

      const result = getEventTypeAndContext(envVars);

      expect(result.eventType).toBe("PULL_REQUEST");
      expect(result.triggerContext).toBe("pull request reopened");
    });

    test("should handle pull_request_target without eventAction", () => {
      const envVars: PreparedContext = {
        repository: "owner/repo",
        claudeCommentId: "12345",
        triggerPhrase: "@claude",
        eventData: {
          eventName: "pull_request_target",
          isPR: true,
          prNumber: "999",
        },
      };

      const result = getEventTypeAndContext(envVars);

      expect(result.eventType).toBe("PULL_REQUEST");
      expect(result.triggerContext).toBe("pull request event");
    });
  });

  describe("generatePrompt for pull_request_target", () => {
    test("should generate correct prompt for pull_request_target event", () => {
      const envVars: PreparedContext = {
        repository: "owner/repo",
        claudeCommentId: "12345",
        triggerPhrase: "@claude",
        eventData: {
          eventName: "pull_request_target",
          eventAction: "opened",
          isPR: true,
          prNumber: "123",
        },
      };

      const prompt = generatePrompt(
        envVars,
        mockGitHubData,
        false,
        mockTagMode,
      );

      // Should contain pull request event type
      expect(prompt).toContain("<event_type>PULL_REQUEST</event_type>");
      expect(prompt).toContain("<is_pr>true</is_pr>");
      expect(prompt).toContain("<pr_number>123</pr_number>");
      expect(prompt).toContain(
        "<trigger_context>pull request opened</trigger_context>",
      );

      // Should contain PR-specific information
      expect(prompt).toContain("- src/feature.ts (ADDED) +20/-5 SHA: def456");
      expect(prompt).toContain("external-contributor");

      // Should contain repository information
      expect(prompt).toContain("<repository>owner/repo</repository>");
    });

    test("should handle pull_request_target with commit signing disabled", () => {
      const envVars: PreparedContext = {
        repository: "owner/repo",
        claudeCommentId: "12345",
        triggerPhrase: "@claude",
        eventData: {
          eventName: "pull_request_target",
          eventAction: "synchronize",
          isPR: true,
          prNumber: "456",
        },
      };

      const prompt = generatePrompt(
        envVars,
        mockGitHubData,
        false,
        mockTagMode,
      );

      // Should include git commands for non-commit-signing mode
      expect(prompt).toContain("git push");
      expect(prompt).toContain(
        "Always push to the existing branch when triggered on a PR",
      );
      expect(prompt).toContain("mcp__github_comment__update_claude_comment");

      // Should not include commit signing tools
      expect(prompt).not.toContain("mcp__github_file_ops__commit_files");
    });

    test("should handle pull_request_target with commit signing enabled", () => {
      const envVars: PreparedContext = {
        repository: "owner/repo",
        claudeCommentId: "12345",
        triggerPhrase: "@claude",
        eventData: {
          eventName: "pull_request_target",
          eventAction: "synchronize",
          isPR: true,
          prNumber: "456",
        },
      };

      const prompt = generatePrompt(envVars, mockGitHubData, true, mockTagMode);

      // Should include commit signing tools
      expect(prompt).toContain("mcp__github_file_ops__commit_files");
      expect(prompt).toContain("mcp__github_file_ops__delete_files");
      expect(prompt).toContain("mcp__github_comment__update_claude_comment");

      // Should not include git command instructions
      expect(prompt).not.toContain("Use git commands via the Bash tool");
    });

    test("should treat pull_request_target same as pull_request in prompt generation", () => {
      const basePreparedContext: PreparedContext = {
        repository: "owner/repo",
        claudeCommentId: "12345",
        triggerPhrase: "@claude",
        eventData: {
          eventAction: "opened",
          isPR: true,
          prNumber: "123",
          eventName: "pull_request_target",
        },
      };

      // Generate prompt for pull_request
      const pullRequestContext: PreparedContext = {
        ...basePreparedContext,
        eventData: {
          ...basePreparedContext.eventData,
          eventName: "pull_request",
          isPR: true,
          prNumber: "123",
        },
      };

      // Generate prompt for pull_request_target
      const pullRequestTargetContext: PreparedContext = {
        ...basePreparedContext,
        eventData: {
          ...basePreparedContext.eventData,
          eventName: "pull_request_target",
          isPR: true,
          prNumber: "123",
        },
      };

      const pullRequestPrompt = generatePrompt(
        pullRequestContext,
        mockGitHubData,
        false,
        mockTagMode,
      );
      const pullRequestTargetPrompt = generatePrompt(
        pullRequestTargetContext,
        mockGitHubData,
        false,
        mockTagMode,
      );

      // Both should have the same event type and structure
      expect(pullRequestPrompt).toContain(
        "<event_type>PULL_REQUEST</event_type>",
      );
      expect(pullRequestTargetPrompt).toContain(
        "<event_type>PULL_REQUEST</event_type>",
      );

      expect(pullRequestPrompt).toContain(
        "<trigger_context>pull request opened</trigger_context>",
      );
      expect(pullRequestTargetPrompt).toContain(
        "<trigger_context>pull request opened</trigger_context>",
      );

      // Both should contain PR-specific instructions
      expect(pullRequestPrompt).toContain(
        "Always push to the existing branch when triggered on a PR",
      );
      expect(pullRequestTargetPrompt).toContain(
        "Always push to the existing branch when triggered on a PR",
      );
    });

    test("should include custom instructions for pull_request_target", () => {
      const envVars: PreparedContext = {
        repository: "owner/repo",
        claudeCommentId: "12345",
        triggerPhrase: "@claude",
        customInstructions:
          "Always verify security implications for external contributions",
        eventData: {
          eventName: "pull_request_target",
          eventAction: "opened",
          isPR: true,
          prNumber: "789",
        },
      };

      const prompt = generatePrompt(
        envVars,
        mockGitHubData,
        false,
        mockTagMode,
      );

      expect(prompt).toContain(
        "CUSTOM INSTRUCTIONS:\nAlways verify security implications for external contributions",
      );
    });

    test("should handle override prompt with pull_request_target variables", () => {
      const envVars: PreparedContext = {
        repository: "test/repo",
        claudeCommentId: "12345",
        triggerPhrase: "@claude",
        overridePrompt:
          "Target PR #$PR_NUMBER in $REPOSITORY - Event: $EVENT_TYPE - Is PR: $IS_PR",
        eventData: {
          eventName: "pull_request_target",
          eventAction: "synchronize",
          isPR: true,
          prNumber: "456",
        },
      };

      const prompt = generatePrompt(
        envVars,
        mockGitHubData,
        false,
        mockTagMode,
      );

      expect(prompt).toBe(
        "Target PR #456 in test/repo - Event: pull_request_target - Is PR: true",
      );
    });
  });

  describe("GitHub context parsing for pull_request_target", () => {
    test("should create mock context for pull_request_target event", () => {
      const mockContext = createMockContext({
        eventName: "pull_request",
        eventAction: "opened",
        isPR: true,
        entityNumber: 123,
        payload: {
          action: "opened",
          number: 123,
          pull_request: {
            number: 123,
            title: "External contribution",
            body: "Adding new feature from fork",
            user: {
              login: "external-user",
              id: 12345,
            },
            base: { ref: "main" },
            head: { ref: "external-feature" },
          },
          repository: {
            name: "repo",
            full_name: "owner/repo",
            owner: { login: "owner" },
          },
        } as PullRequestEvent,
      });

      expect(mockContext.eventName).toBe("pull_request");
      expect(mockContext.eventAction).toBe("opened");
      expect(mockContext.isPR).toBe(true);
      expect(mockContext.entityNumber).toBe(123);
      expect(mockContext.payload.action).toBe("opened");
    });
  });
});
