export function reportText(report, entries) {
  const players = report.players.map((seat) => `${seat.seatId.toUpperCase()} ${seat.name}`).join(" / ");
  return [`星魂决斗 · 公开战报 v1`, `房间 ${report.roomCode} · 第 ${report.duelNumber} 局`, players,
    `读取时生命值：1P ${report.lp?.p1 ?? "未知"} LP / 2P ${report.lp?.p2 ?? "未知"} LP`,
    report.finished ? "本局已结束" : "对局进行中（导出截至本次读取）",
    report.partial ? "注意：旧房间升级前的公开记录未保存，本文件为部分记录。" : "从开局开始的公开行动记录。",
    "不包含双方手牌、牌序、未公开盖牌或房间凭据。", "",
    ...entries.map((entry) => `#${entry.seq} · 第 ${entry.turn} 回合 · ${entry.text}`)].join("\n");
}

// Shared by the player and spectator pages. No automatic opening, no audio,
// no engine state access: all content comes from the permission-checked API.
export function installPublicReport(client) {
  const dialog = document.createElement("dialog"); dialog.className = "public-report";
  dialog.setAttribute("aria-labelledby", "publicReportTitle");
  dialog.innerHTML = `<header><h2 id="publicReportTitle">完整公开战报</h2><button type="button" data-close>关闭战报</button></header>
    <p class="report-note">仅公开行动，不含手牌和牌序。按需读取，不会暂停正在进行的对局。房间过期前可查阅，请及时导出留存。</p>
    <div class="report-controls"><label>对局<select data-game aria-label="战报对局"></select></label><label>回合<select data-turn aria-label="战报回合"></select></label><button type="button" data-refresh>刷新战报</button><button type="button" data-export>导出本局文本</button></div>
    <p data-status role="status"></p><p data-error role="alert"></p><ol data-entries tabindex="0" aria-label="公开行动记录"></ol>
    <footer><button type="button" data-first>开局</button><button type="button" data-prev>上一页</button><span data-page></span><button type="button" data-next>下一页</button><button type="button" data-last>最新页</button></footer>`;
  document.body.append(dialog);
  const el = Object.fromEntries(["close", "game", "turn", "refresh", "export", "status", "error", "entries", "first", "prev", "next", "last", "page"].map((id) => [id, dialog.querySelector(`[data-${id}]`)]));
  let data = null, room = null, pending = false, generation = 0, opener = null, stale = false;
  const controls = () => {
    const connected = client.socket?.readyState === 1;
    for (const id of ["game", "turn", "refresh", "export", "first", "prev", "next", "last"]) el[id].disabled = pending || !data || !connected;
    el.refresh.disabled = pending || !connected;
    if (!pending && data && connected) {
      el.first.disabled = el.prev.disabled = data.page === 0;
      el.next.disabled = el.last.disabled = data.page >= data.pages - 1;
    }
  };
  const options = (select, values, value) => {
    select.replaceChildren(...values.map(([id, label]) => { const option = document.createElement("option"); option.value = String(id); option.textContent = label; return option; }));
    select.value = String(value);
  };
  async function load({ page = 0, duelNumber = data?.duelNumber, turn = Number(el.turn.value) || 0 } = {}) {
    if (pending) return;
    pending = true; controls(); el.error.textContent = ""; el.status.textContent = "正在读取公开战报…";
    const version = generation;
    try {
      const next = await client.publicHistory({ ...(duelNumber ? { duelNumber } : {}), page, turn });
      if (version !== generation || !dialog.open || next.roomCode !== room) return;
      data = next; stale = false;
      options(el.game, data.duels.map((id) => [id, `第 ${id} 局`]), data.duelNumber);
      options(el.turn, [[0, "全部回合"], ...data.turns.map((id) => [id, `第 ${id} 回合`])], turn);
      el.status.textContent = `房间 ${data.roomCode} · 第 ${data.duelNumber} 局 · ${data.finished ? "已结束" : "进行中，可刷新获取最新"} · 共 ${data.total} 条${data.partial ? "（旧房间，升级前记录缺失）" : "（从开局记录）"}`;
      el.page.textContent = `${data.page + 1} / ${data.pages} 页 · ${data.filteredTotal} 条`;
      el.entries.replaceChildren(...data.entries.map((entry) => {
        const li = document.createElement("li"); li.value = entry.seq;
        li.textContent = `第 ${entry.turn} 回合 · ${entry.text}`; return li;
      }));
      el.entries.scrollTop = 0;
    } catch (error) { if (version === generation) { el.error.textContent = error.message; el.status.textContent = "读取未成功；可关闭后重试。"; } }
    finally { if (version === generation) { pending = false; controls(); } }
  }
  function close() { generation += 1; pending = false; data = null; if (dialog.open) dialog.close(); }
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-public-report]");
    if (!trigger || !client.view?.duelNumber) return;
    opener = trigger; room = client.view.roomCode; data = null; generation += 1; pending = false;
    el.entries.replaceChildren(); el.error.textContent = ""; el.page.textContent = "";
    options(el.game, [], ""); options(el.turn, [[0, "全部回合"]], 0);
    if (!dialog.open) dialog.showModal();
    void load({ duelNumber: client.view.duelNumber, turn: 0 });
  });
  el.close.addEventListener("click", close);
  dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") event.stopPropagation(); });
  dialog.addEventListener("close", () => { generation += 1; pending = false; data = null; opener?.focus({ preventScroll: true }); });
  el.game.addEventListener("change", () => { void load({ duelNumber: Number(el.game.value), turn: 0 }); });
  el.turn.addEventListener("change", () => { void load(); });
  el.refresh.addEventListener("click", () => { void load({ duelNumber: data?.duelNumber || client.view?.duelNumber, page: data?.page || 0 }); });
  for (const [id, page] of [["first", () => 0], ["prev", () => data.page - 1], ["next", () => data.page + 1], ["last", () => data.pages - 1]]) {
    el[id].addEventListener("click", () => { void load({ page: page() }); });
  }
  el.export.addEventListener("click", async () => {
    if (pending || !data) return;
    const version = generation, duelNumber = data.duelNumber;
    pending = true; controls(); el.error.textContent = ""; el.status.textContent = "正在准备本局全部公开记录…";
    try {
      const first = await client.publicHistory({ duelNumber, page: 0 });
      const entries = [...first.entries];
      for (let page = 1; page < first.pages; page++) {
        if (version !== generation) return;
        const next = await client.publicHistory({ duelNumber, page, through: first.total }); entries.push(...next.entries);
      }
      if (version !== generation || !dialog.open) return;
      const url = URL.createObjectURL(new Blob(["\uFEFF", reportText(first, entries)], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `star-duel-${first.roomCode}-game-${duelNumber}-public.txt`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      el.status.textContent = `已导出第 ${duelNumber} 局全部 ${entries.length} 条公开记录${first.partial ? "（旧房间部分记录）" : ""}。`;
    } catch (error) { if (version === generation) el.error.textContent = error.message; }
    finally { if (version === generation) { pending = false; controls(); } }
  });
  client.on("watch-ended", close);
  client.on("view", (view) => {
    if (!dialog.open) return;
    if (view.roomCode !== room) close();
    else if (stale) { stale = false; el.status.textContent = "连接已恢复，可刷新读取最新公开记录。"; controls(); }
  });
  client.on("connection", ({ connected }) => { if (!connected && dialog.open) { stale = true; generation += 1; pending = false; el.status.textContent = data ? "连接中断，当前为已读取的公开战报；恢复连接后可刷新。" : "连接中断，战报尚未读取完成；恢复连接后可重试。"; controls(); } });
  return { close };
}
