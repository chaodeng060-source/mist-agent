import { describe, expect, it } from "vitest";
import { evaluateGroupChatEvidence, groupChatChecks } from "./group-chat-checks.ts";
import {
  GROUP_CHAT_CHECK_IDS,
  type GroupChatEvidenceById,
  groupChatSyntheticFixture,
} from "./group-chat-driver.ts";
import { missingDriverResults } from "./group-chat-run.ts";

const validEvidence: { [K in keyof GroupChatEvidenceById]: GroupChatEvidenceById[K] } = {
  "GC-01": {
    legitimateHuman: { accepted: true, authorId: "test-human:owner" },
    legitimate: { accepted: true, authorId: "test-resident:a" },
    forgedEnvelopeAccepted: false,
    recordedAuthorIds: ["test-human:owner", "test-resident:a"],
  },
  "GC-02": {
    publicPayloadAccepted: true,
    missingVisibilityAccepted: false,
    missingRoomAccepted: false,
    missingBindingAccepted: false,
    extraPrivateFieldsAccepted: false,
    leakedCanaries: [],
  },
  "GC-03": {
    roomEventIdsBeforeSave: ["evt-public-1"],
    roomEventIdsAfterSave: ["evt-public-1"],
    deliveryByResident: {
      "test-resident:a": "loaded",
      "test-resident:b": "queued",
      "test-resident:c": "not-targeted",
    },
    memoryWritesByResident: { "test-resident:a": 1, "test-resident:b": 0, "test-resident:c": 0 },
    privateCanariesVisibleToOtherResidents: [],
    savedSourceEventId: "evt-public-1",
  },
  "GC-04": {
    rosterVersion: 2,
    expectedNewResidentId: "test-resident:c",
    residentIdsByPath: {
      broadcast: ["test-resident:a", "test-resident:b", "test-resident:c"],
      mention: ["test-resident:a", "test-resident:b", "test-resident:c"],
      projection: ["test-resident:a", "test-resident:b", "test-resident:c"],
      feedback: ["test-resident:a", "test-resident:b", "test-resident:c"],
      status: ["test-resident:a", "test-resident:b", "test-resident:c"],
    },
    hardCodedResidentBranchFound: false,
    humanRenderedAsResident: false,
  },
  "GC-05": {
    callsFromTextOnlyMentions: 0,
    structuredTargetId: "test-resident:b",
    routedResidentId: "test-resident:b",
    unknownTargetRejected: true,
    unauthorizedTargetRejected: true,
    turnOrStopGateBypassed: false,
  },
  "GC-09": {
    receipts: [
      { actor: "system", phase: "recorded" },
      { actor: "system", phase: "dispatched" },
      { actor: "system", phase: "context-committed", contextCommitRef: "ctx-commit:test-1" },
    ],
    systemClaimedPersonalPresence: false,
    systemClaimedUnderstandingOrMemory: false,
    residentReactionAuthorId: "test-resident:a",
  },
  "GC-15": {
    authorizedPublicSurface: ["public-body"],
    unauthorizedSurfaceLeaks: [],
    crossResidentPrivateReads: 0,
    newResidentReceivedHistoryByDefault: false,
  },
};

describe("#191 group-chat acceptance contract (synthetic harness self-test only)", () => {
  it("freezes exactly the seven PR1 lamps", () => {
    expect(groupChatChecks.map(({ id }) => id)).toEqual(GROUP_CHAT_CHECK_IDS);
  });

  it("uses only synthetic identities, room, and privacy canaries", () => {
    expect(groupChatSyntheticFixture.roomId).toMatch(/^test-room:/);
    expect(
      Object.values(groupChatSyntheticFixture.residentIds).every((id) =>
        id.startsWith("test-resident:"),
      ),
    ).toBe(true);
    expect(
      Object.values(groupChatSyntheticFixture.canaries).every((value) =>
        value.startsWith("TEST-PRIVATE-CANARY:"),
      ),
    ).toBe(true);
  });

  it("accepts the positive evidence shape without treating it as host evidence", () => {
    for (const check of groupChatChecks) {
      const result = evaluateGroupChatEvidence(check.id, validEvidence[check.id]);
      expect(result.passed, check.id).toBe(true);
    }
  });

  it("rejects an identity-spoofing observation", () => {
    const result = evaluateGroupChatEvidence("GC-01", {
      ...validEvidence["GC-01"],
      forgedEnvelopeAccepted: true,
    });
    expect(result.passed).toBe(false);
  });

  it("rejects evidence that omits the accepted human from the room ledger", () => {
    const result = evaluateGroupChatEvidence("GC-01", {
      ...validEvidence["GC-01"],
      recordedAuthorIds: ["test-resident:a"],
    });
    expect(result.passed).toBe(false);
  });

  it("rejects an old member presented as the newly registered member", () => {
    const residentIds = ["test-resident:a", "test-resident:b", "test-resident:a"] as const;
    const result = evaluateGroupChatEvidence("GC-04", {
      ...validEvidence["GC-04"],
      expectedNewResidentId: "test-resident:a",
      residentIdsByPath: {
        broadcast: residentIds,
        mention: residentIds,
        projection: residentIds,
        feedback: residentIds,
        status: residentIds,
      },
    });
    expect(result.passed).toBe(false);
  });

  it("rejects GC-02 when a private canary appears on a public surface", () => {
    const result = evaluateGroupChatEvidence("GC-02", {
      ...validEvidence["GC-02"],
      leakedCanaries: [groupChatSyntheticFixture.canaries.privateA],
    });
    expect(result.passed).toBe(false);
  });

  it("rejects GC-03 when a queued resident receives a personal memory write", () => {
    const result = evaluateGroupChatEvidence("GC-03", {
      ...validEvidence["GC-03"],
      memoryWritesByResident: {
        ...validEvidence["GC-03"].memoryWritesByResident,
        "test-resident:b": 1,
      },
    });
    expect(result.passed).toBe(false);
  });

  it("rejects GC-05 when plain-text mentions trigger a call", () => {
    const result = evaluateGroupChatEvidence("GC-05", {
      ...validEvidence["GC-05"],
      callsFromTextOnlyMentions: 1,
    });
    expect(result.passed).toBe(false);
  });

  it("rejects GC-15 when a new resident receives history by default", () => {
    const result = evaluateGroupChatEvidence("GC-15", {
      ...validEvidence["GC-15"],
      newResidentReceivedHistoryByDefault: true,
    });
    expect(result.passed).toBe(false);
  });

  it("rejects a system receipt whose phase is outside the recorded delivery stages", () => {
    const result = evaluateGroupChatEvidence("GC-09", {
      ...validEvidence["GC-09"],
      receipts: [{ actor: "system", phase: "understood" }],
    });
    expect(result.passed).toBe(false);
  });

  it("rejects GC-09 if context-committed is missing", () => {
    const result = evaluateGroupChatEvidence("GC-09", {
      ...validEvidence["GC-09"],
      receipts: validEvidence["GC-09"].receipts.slice(0, 2),
    });
    expect(result.passed).toBe(false);
  });

  it("rejects GC-09 when only the recorded phase is present", () => {
    const result = evaluateGroupChatEvidence("GC-09", {
      ...validEvidence["GC-09"],
      receipts: [{ actor: "system", phase: "recorded" }],
    });
    expect(result.passed).toBe(false);
  });

  it("does not treat words containing read as a read claim", () => {
    const result = evaluateGroupChatEvidence("GC-09", {
      ...validEvidence["GC-09"],
      receipts: [
        { actor: "system", phase: "recorded", claim: "ready" },
        { actor: "system", phase: "dispatched", claim: "thread already open" },
        {
          actor: "system",
          phase: "context-committed",
          contextCommitRef: "ctx-commit:test-1",
          claim: "commit recorded",
        },
      ],
    });
    expect(result.passed).toBe(true);
  });

  it("rejects GC-09 when the context commit has no reference", () => {
    const result = evaluateGroupChatEvidence("GC-09", {
      ...validEvidence["GC-09"],
      receipts: [
        ...validEvidence["GC-09"].receipts.slice(0, 2),
        { actor: "system", phase: "context-committed" },
      ],
    });
    expect(result.passed).toBe(false);
  });

  it("reports the missing real-host driver as seven expected red lamps", () => {
    const results = missingDriverResults();
    expect(results.map(({ id }) => id)).toEqual(GROUP_CHAT_CHECK_IDS);
    expect(
      results.every(({ passed, detail }) => !passed && detail.includes("real-host driver missing")),
    ).toBe(true);
  });
});
