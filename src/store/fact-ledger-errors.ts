/**
 * 事实账的错误类 —— 账本体（fact-ledger.ts）抛出的全部失败形状。
 *
 * 只从 fact-ledger.ts 原样搬来，一个字节不改：形状、消息、name 都是原来的，
 * 搬家不改行为。放在单独一份是因为账本体已经过长，而这些类彼此不依赖，
 * 也不依赖账上的任何类型。
 */

/** 跨住户访问时抛这个，不返回空账——静默的空结果会把 bug 藏起来（同 ResidentStore 的房规）。 */
export class LedgerNotFoundError extends Error {
  constructor(residentId: string) {
    super(`no such ledger: ${residentId}`);
    this.name = "LedgerNotFoundError";
  }
}

/** 查一扇没开过户的窗的确认位时抛。 */
export class ViewportNotFoundError extends Error {
  constructor(residentId: string, viewportId: string) {
    super(`no ack row for viewport ${viewportId} in ledger of ${residentId}`);
    this.name = "ViewportNotFoundError";
  }
}

/** supersede 指向不存在的 seq 时抛。 */
export class LedgerEntryNotFoundError extends Error {
  constructor(residentId: string, targetSeq: number) {
    super(`no such ledger entry in ${residentId}: seq ${targetSeq}`);
    this.name = "LedgerEntryNotFoundError";
  }
}

/** 解除动作本身不合法：目标是另一条 supersede，或该条目已被解除过。 */
export class InvalidSupersedeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSupersedeError";
  }
}

/** 确认位只前进不后退，也不能确认账上还不存在的 seq。 */
export class AckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AckError";
  }
}

/**
 * C04（闸在非缺失方）：窗署名的裁定级写入，发起窗落后于账
 * （ackedSeq < latestSeq）时的拒收。拦截站在账侧写路径上——窗自查
 * 不是闸，忘了自查的窗和故意不自查的窗在这里长一个样。
 */
export class StaleViewportError extends Error {
  constructor(residentId: string, viewportId: string, ackedSeq: number, latestSeq: number) {
    super(
      `viewport ${viewportId} of ${residentId} is stale (acked ${ackedSeq} < latest ${latestSeq}) —— 未知悉最新裁定的窗无权写裁定级条目，先过开工闸拉平缺口`,
    );
    this.name = "StaleViewportError";
  }
}

/**
 * C04 的 unknown 半格：窗署名写入时查账失败（GapProbe unknown）即
 * fail-closed——「查不到」不许被当成「没缺口」放行（与 MV-C03 同一条
 * 纪律：unknown 和零是两个值）。
 */
export class WriteGateUnavailableError extends Error {
  constructor(residentId: string, viewportId: string, cause: string) {
    super(
      `ledger probe unknown for viewport ${viewportId} of ${residentId}（${cause}）—— 裁定级写入 fail-closed`,
    );
    this.name = "WriteGateUnavailableError";
  }
}

/**
 * C04 权威半格：写入三元组携带的 generation 与权威现查（viewportAuthority）
 * 不符——旧代的窗无权署名当代写入。换代意味着窗对世界的知悉从头论起
 * （D8 猝死语义：新代靠交接信重新对齐，不续旧窗），旧代号写入与落后
 * 序号写入是同一种病的两个切面。
 */
export class StaleGenerationError extends Error {
  constructor(residentId: string, viewportId: string, claimed: number, current: number) {
    super(
      `viewport ${viewportId} of ${residentId} writes as generation ${claimed} but authority says ${current} —— 旧代的窗无权写裁定级条目`,
    );
    this.name = "StaleGenerationError";
  }
}

/**
 * C04 归属半格（上游界 review 抓的洞）：权威说这扇窗属于别的住户——
 * 别家的真窗即使被误挂进目标账的确认位，也不许给目标账署名写入。
 * 三元组的 residentId 自比只是自证清白，两侧都来自调用参数；归属
 * 必须由权威（SessionRegistry 侧）现查，不凭调用方一面之词。
 */
export class ForeignViewportError extends Error {
  constructor(residentId: string, viewportId: string, ownerResidentId: string) {
    super(
      `viewport ${viewportId} belongs to ${ownerResidentId}, not ${residentId} —— 别家的窗无权给这本账署名写入`,
    );
    this.name = "ForeignViewportError";
  }
}
