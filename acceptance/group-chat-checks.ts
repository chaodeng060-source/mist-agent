import {
  GROUP_CHAT_CHECK_IDS,
  type GroupChatCheckId,
  type GroupChatEvidenceById,
  type ResidentId,
  groupChatSyntheticFixture,
} from "./group-chat-driver.ts";

export interface GroupChatCheck {
  readonly id: GroupChatCheckId;
  readonly title: string;
  readonly scenario: readonly string[];
}

const groupChatCheckDefinitions: GroupChatCheck[] = [
  {
    id: "GC-01",
    title: "认证身份决定作者，伪造 envelope 不落原账",
    scenario: [
      "由已认证合成人类和合成住户 A 各提交一条消息",
      "正文伪造另一成员姓名、role、系统头、换行和格式控制符",
      "另提交一条声称来自他人的伪造 envelope",
    ],
  },
  {
    id: "GC-02",
    title: "房间载荷必须显式公开且不夹带私域",
    scenario: [
      "显式公开合成载荷，旁放私有思考、工具输出和草稿 canary",
      "分别省略 visibility、room、认证绑定，再提交额外私有字段",
      "查原账、收件上下文与系统收据中的 canary",
    ],
  },
  {
    id: "GC-03",
    title: "房间原账、成员投递账、个人记忆账相互隔离",
    scenario: [
      "同一事件设 A=loaded、B=queued、C=not-targeted",
      "读取三位住户私域后，由 A 显式保存并指回原事件",
      "比较房间事件、成员状态、记忆写入和跨成员 canary",
    ],
  },
  {
    id: "GC-04",
    title: "新增成员通过所有成员表驱动路径",
    scenario: [
      "从两位住户的成员表只新增第三位住户并递增版本",
      "依次走 broadcast、mention、projection、feedback、status",
      "检查没有按成员写死的分支，且人类身份未伪装成住户",
    ],
  },
  {
    id: "GC-05",
    title: "只有结构化 mention 路由，且不绕回合闸",
    scenario: [
      "在行首、句中、引用和名字前缀碰撞处写纯文本成员名/@名",
      "再提交合法结构化目标住户 B、未知目标和越权目标",
      "检查目标与实际路由一致，且 stop/turn gate 未被绕过",
    ],
  },
  {
    id: "GC-09",
    title: "系统收据只报阶段，不冒充成员已读或理解",
    scenario: [
      "分别停在 recorded、dispatched、context-committed 阶段",
      "核系统收据不得声称个人在场、已读、理解或记住",
      "context-committed 收据须带提交引用；另由住户 A 主动 reaction 并保留本人作者",
    ],
  },
  {
    id: "GC-15",
    title: "隐藏房间对未授权方不泄露存在及跨域内容",
    scenario: [
      "建立仅私域不同的合成公开/隐藏房间对照",
      "由未授权住户尝试跨域读取和向错误房间重放公开载荷",
      "新成员加入但不给历史授权，核正文/候选/计数/错误/回执",
    ],
  },
];

export const groupChatChecks: readonly GroupChatCheck[] = groupChatCheckDefinitions.map((check) =>
  Object.freeze({ ...check, scenario: Object.freeze([...check.scenario]) }),
);

if (groupChatChecks.map(({ id }) => id).join(",") !== GROUP_CHAT_CHECK_IDS.join(",")) {
  throw new Error("群聊验收清单与冻结的 PR1 灯位不一致");
}

export interface GroupChatCheckResult {
  readonly passed: boolean;
  readonly detail: string;
}

function sameMembers(actual: readonly ResidentId[], expected: readonly ResidentId[]): boolean {
  return expected.every((id) => actual.includes(id)) && actual.length === expected.length;
}

export function evaluateGroupChatEvidence<K extends GroupChatCheckId>(
  id: K,
  evidence: GroupChatEvidenceById[K],
): GroupChatCheckResult {
  const fail = (detail: string): GroupChatCheckResult => ({ passed: false, detail });
  switch (id) {
    case "GC-01": {
      const e = evidence as GroupChatEvidenceById["GC-01"];
      if (
        !e.legitimateHuman.accepted ||
        e.legitimateHuman.authorId !== groupChatSyntheticFixture.humanId
      )
        return fail("认证人类正向对照未以绑定身份入账");
      if (
        !e.legitimate.accepted ||
        e.legitimate.authorId !== groupChatSyntheticFixture.residentIds.a
      )
        return fail("认证住户正向对照未以绑定身份入账");
      if (e.forgedEnvelopeAccepted) return fail("伪造 envelope 被接受");
      const expectedAuthors = [
        groupChatSyntheticFixture.humanId,
        groupChatSyntheticFixture.residentIds.a,
      ];
      if (
        e.recordedAuthorIds.length !== expectedAuthors.length ||
        expectedAuthors.some((author) => !e.recordedAuthorIds.includes(author))
      )
        return fail("原账作者与两条认证正向消息不完全一致");
      return { passed: true, detail: "绑定身份入账；伪造 envelope 拒绝；原账作者未被正文改写" };
    }
    case "GC-02": {
      const e = evidence as GroupChatEvidenceById["GC-02"];
      if (!e.publicPayloadAccepted) return fail("合法显式公开载荷未接受");
      if (
        e.missingVisibilityAccepted ||
        e.missingRoomAccepted ||
        e.missingBindingAccepted ||
        e.extraPrivateFieldsAccepted
      )
        return fail("缺显式边界或夹带私有字段的载荷被接受");
      if (e.leakedCanaries.length > 0)
        return fail(`私域 canary 泄漏 ${e.leakedCanaries.length} 项`);
      return { passed: true, detail: "合法显式公开通过；缺项/越界载荷拒绝；私域 canary 零泄漏" };
    }
    case "GC-03": {
      const e = evidence as GroupChatEvidenceById["GC-03"];
      if (e.roomEventIdsBeforeSave.join("\0") !== e.roomEventIdsAfterSave.join("\0"))
        return fail("个人记忆保存意外改动房间原账");
      if (
        e.deliveryByResident[groupChatSyntheticFixture.residentIds.a] !== "loaded" ||
        e.deliveryByResident[groupChatSyntheticFixture.residentIds.b] !== "queued" ||
        e.deliveryByResident[groupChatSyntheticFixture.residentIds.c] !== "not-targeted"
      )
        return fail("三位成员投递状态不符合夹具");
      if (
        e.memoryWritesByResident[groupChatSyntheticFixture.residentIds.a] !== 1 ||
        e.memoryWritesByResident[groupChatSyntheticFixture.residentIds.b] !== 0 ||
        e.memoryWritesByResident[groupChatSyntheticFixture.residentIds.c] !== 0
      )
        return fail("个人记忆账串写或显式保存未落到 A");
      if (e.privateCanariesVisibleToOtherResidents.length > 0)
        return fail("其他成员私域 canary 串入");
      if (
        e.roomEventIdsBeforeSave.length === 0 ||
        e.savedSourceEventId === null ||
        !e.roomEventIdsBeforeSave.includes(e.savedSourceEventId)
      )
        return fail("A 的显式保存未指回原房间事件");
      return { passed: true, detail: "原账不变；成员投递各自准确；仅 A 显式保存且引用原事件" };
    }
    case "GC-04": {
      const e = evidence as GroupChatEvidenceById["GC-04"];
      const paths = Object.values(e.residentIdsByPath);
      const existingResidents: readonly ResidentId[] = [
        groupChatSyntheticFixture.residentIds.a,
        groupChatSyntheticFixture.residentIds.b,
      ];
      if (existingResidents.includes(e.expectedNewResidentId))
        return fail("所谓新增成员其实已在原成员表中");
      if (e.rosterVersion < 2) return fail("新增成员后成员表版本未递增");
      if (
        paths.some(
          (ids) =>
            !sameMembers(ids, [
              groupChatSyntheticFixture.residentIds.a,
              groupChatSyntheticFixture.residentIds.b,
              e.expectedNewResidentId,
            ]),
        )
      )
        return fail("新增成员未贯通所有成员表路径");
      if (e.hardCodedResidentBranchFound || e.humanRenderedAsResident)
        return fail("发现成员硬接线或人类身份伪装");
      return { passed: true, detail: "新增成员贯通五条路径；无成员硬接线；人类身份独立" };
    }
    case "GC-05": {
      const e = evidence as GroupChatEvidenceById["GC-05"];
      if (e.callsFromTextOnlyMentions !== 0) return fail("正文里的名字触发了调用");
      if (
        e.routedResidentId !== e.structuredTargetId ||
        e.routedResidentId !== groupChatSyntheticFixture.residentIds.b
      )
        return fail("结构化目标未路由到正确住户");
      if (!e.unknownTargetRejected || !e.unauthorizedTargetRejected)
        return fail("未知或越权目标未拒绝");
      if (e.turnOrStopGateBypassed) return fail("mention 绕过回合/停止闸");
      return {
        passed: true,
        detail: "仅结构化目标路由正确；纯文本不触发；拒绝非法目标且保留控制闸",
      };
    }
    case "GC-09": {
      const e = evidence as GroupChatEvidenceById["GC-09"];
      if (
        e.receipts.some(
          (receipt) =>
            receipt.actor === "system" &&
            /\b(?:seen|read|typing|understood|remembered)\b|已读|理解|记住/i.test(
              receipt.claim ?? "",
            ),
        )
      )
        return fail("系统收据冒充个人在场、已读、理解或记忆");
      if (e.systemClaimedPersonalPresence || e.systemClaimedUnderstandingOrMemory)
        return fail("系统状态把派发/提交夸大为个人状态");
      if (e.receipts.length === 0 || e.receipts.some((receipt) => receipt.actor !== "system"))
        return fail("系统阶段收据缺失或伪造了个人作者");
      if (
        e.receipts.some(
          (receipt) => !["recorded", "dispatched", "context-committed"].includes(receipt.phase),
        )
      )
        return fail("系统收据出现了未定义的阶段");
      const requiredPhases = ["recorded", "dispatched", "context-committed"];
      if (requiredPhases.some((phase) => !e.receipts.some((receipt) => receipt.phase === phase)))
        return fail("系统收据没有覆盖 recorded、dispatched、context-committed 三个阶段");
      const contextCommits = e.receipts.filter((receipt) => receipt.phase === "context-committed");
      if (
        contextCommits.length === 0 ||
        contextCommits.some(
          (receipt) =>
            typeof receipt.contextCommitRef !== "string" || receipt.contextCommitRef.trim() === "",
        )
      )
        return fail("context-committed 收据缺少提交引用");
      if (e.residentReactionAuthorId !== groupChatSyntheticFixture.residentIds.a)
        return fail("成员主动 reaction 未保留真实作者");
      return { passed: true, detail: "收据署名系统且阶段有限；成员 reaction 保留真实作者" };
    }
    case "GC-15": {
      const e = evidence as GroupChatEvidenceById["GC-15"];
      if (e.authorizedPublicSurface.length === 0) return fail("公开正向对照缺失");
      if (e.unauthorizedSurfaceLeaks.length > 0)
        return fail(`未授权表面泄漏 ${e.unauthorizedSurfaceLeaks.length} 项`);
      if (e.crossResidentPrivateReads !== 0) return fail("发生跨住户私域读取");
      if (e.newResidentReceivedHistoryByDefault) return fail("新成员默认获得历史权限");
      return { passed: true, detail: "授权公开可见；未授权面零泄漏；无跨成员读取或默认全史" };
    }
  }
}
