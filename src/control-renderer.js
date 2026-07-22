function pending(value) {
  return Boolean(value);
}

export function buildDuelControlsView({
  started = false,
  gameOver = false,
  paused = false,
  setupModalOpen = false,
  actions = {},
  canUseTurnControls = false,
  canAct = false,
  pendingTarget = null,
  pendingFusion = null,
  pendingTribute = null,
  selectedHandReady = false,
  selectedHandName = "",
  selectedHandReason = "",
  targetPrompt = "",
  targetSelectionStatus = null,
  fusionStatus = null,
  selectionPrompt = "",
  confirmLabel = "确认",
  phase = "ready",
  selectedPlayerMonster = false,
  selectedPlayerMonsterCanChangeMode = selectedPlayerMonster,
  selectedPlayerMonsterModeReason = "",
  focusedCard = null,
  soundOn = true,
  musicOn = true,
  musicMode = "idle",
  musicPlaying = false,
  musicVolume = 1,
  voiceOn = true
} = {}) {
  const hasTarget = pending(pendingTarget);
  const hasFusion = pending(pendingFusion);
  const hasTribute = pending(pendingTribute);
  const hasPendingSelection = hasTarget || hasFusion || hasTribute;
  const selectionBlocksTurn = hasPendingSelection;
  const currentConfirmLabel = hasTarget
    ? targetSelectionStatus?.confirmLabel || "确认发动"
    : confirmLabel;
  const cancelLabel = hasTarget ? "取消目标" : "取消选择";
  const showChoiceActions = canAct && (hasPendingSelection || selectedHandReady);
  let choiceText = "";

  if (hasTarget) {
    choiceText = targetSelectionStatus?.text || targetPrompt;
  } else if (hasFusion) {
    const fusionName = pendingFusion?.cardName || selectedHandName;
    choiceText = selectionPrompt || (fusionStatus?.needsResult
      ? `${fusionName}：先选择融合结果。`
      : `${fusionName}：选择融合素材 ${fusionStatus?.selectedCount || 0}/${fusionStatus?.requiredCount || 0}。`);
  } else if (hasTribute && selectionPrompt) {
    choiceText = selectionPrompt;
  } else if (showChoiceActions) {
    choiceText = `${selectedHandName}：${selectedHandReason || "确认后发动。"}`;
  }

  const volumePercent = Math.round(Number(musicVolume) * 100);

  return {
    start: {
      disabled: setupModalOpen || (started && !gameOver),
      title: setupModalOpen ? "请点击准备面板里的开始决斗" : "开始决斗"
    },
    pause: {
      disabled: !started || gameOver,
      text: paused ? "继续" : "暂停"
    },
    skipAttack: {
      disabled: !canUseTurnControls || selectionBlocksTurn || !actions.attack,
      title: "放弃本回合剩余攻击机会"
    },
    endTurn: {
      disabled: !canUseTurnControls || selectionBlocksTurn,
      text: "结束回合",
      title: "结束你的回合"
    },
    sound: {
      text: soundOn ? "音效 开" : "音效 关",
      off: !soundOn
    },
    music: {
      text: musicOn ? (musicMode === "critical" ? "音乐 紧张" : "音乐 开") : "音乐 关",
      off: !musicOn,
      critical: musicOn && musicMode === "critical",
      mode: musicMode,
      playing: musicPlaying,
      pressed: musicOn,
      volumePercent,
      volumeDisabled: !musicOn
    },
    voice: {
      text: voiceOn ? "语音 开" : "语音 关",
      off: !voiceOn
    },
    hand: {
      confirmText: currentConfirmLabel,
      confirmDisabled: hasTarget ? !targetSelectionStatus?.complete : !selectedHandReady,
      cancelText: cancelLabel,
      cancelDisabled: !canAct || (!hasPendingSelection && !selectedHandReady)
    },
    choice: {
      hidden: !showChoiceActions,
      text: choiceText,
      confirmText: currentConfirmLabel,
      confirmDisabled: hasTarget ? !targetSelectionStatus?.complete : !selectedHandReady,
      cancelText: cancelLabel,
      cancelDisabled: !canAct,
      target: hasTarget,
      fusion: hasFusion,
      material: hasFusion || hasTribute,
      split: pendingTarget?.effect === "splitToken"
    },
    modeDisabled: hasPendingSelection || !canAct || phase !== "main" || !selectedPlayerMonsterCanChangeMode,
    modeTitle: selectedPlayerMonsterModeReason || "切换所选怪兽的攻击／守备表示",
    detailDisabled: !focusedCard
  };
}

export function renderDuelControls(elements, view) {
  if (!elements || !view) return false;

  elements.startBtn.disabled = view.start.disabled;
  elements.startBtn.title = view.start.title;
  elements.pauseBtn.disabled = view.pause.disabled;
  elements.pauseBtn.textContent = view.pause.text;
  elements.skipAttackBtn.disabled = view.skipAttack.disabled;
  elements.skipAttackBtn.title = view.skipAttack.title;
  elements.endTurnBtn.disabled = view.endTurn.disabled;
  elements.endTurnBtn.textContent = view.endTurn.text;
  elements.endTurnBtn.title = view.endTurn.title;

  elements.soundBtn.textContent = view.sound.text;
  elements.soundBtn.classList.toggle("sound-off", view.sound.off);
  elements.musicBtn.textContent = view.music.text;
  elements.musicBtn.classList.toggle("sound-off", view.music.off);
  elements.musicBtn.classList.toggle("music-critical", view.music.critical);
  elements.musicBtn.dataset.mode = view.music.mode;
  elements.musicBtn.dataset.playing = String(view.music.playing);
  elements.musicBtn.setAttribute("aria-pressed", String(view.music.pressed));
  elements.musicVolume.value = String(view.music.volumePercent);
  elements.musicVolume.disabled = view.music.volumeDisabled;
  elements.musicVolume.style.setProperty("--music-volume", `${view.music.volumePercent}%`);
  elements.voiceBtn.textContent = view.voice.text;
  elements.voiceBtn.classList.toggle("sound-off", view.voice.off);

  elements.handConfirmBtn.textContent = view.hand.confirmText;
  elements.handConfirmBtn.disabled = view.hand.confirmDisabled;
  elements.handCancelBtn.textContent = view.hand.cancelText;
  elements.handCancelBtn.disabled = view.hand.cancelDisabled;

  if (elements.choiceActions) {
    elements.choiceActions.hidden = view.choice.hidden;
    if (!view.choice.hidden) {
      elements.choiceText.textContent = view.choice.text;
      elements.choiceConfirmBtn.textContent = view.choice.confirmText;
      elements.choiceConfirmBtn.disabled = view.choice.confirmDisabled;
      elements.choiceCancelBtn.textContent = view.choice.cancelText;
      elements.choiceCancelBtn.disabled = view.choice.cancelDisabled;
    }
    elements.choiceActions.classList.toggle("fusion-choice", view.choice.fusion);
    elements.choiceActions.classList.toggle("material-choice", view.choice.material);
    elements.choiceActions.classList.toggle("target-choice", view.choice.target);
    elements.choiceActions.classList.toggle("split-choice", view.choice.split);
  }

  elements.modeBtn.disabled = view.modeDisabled;
  elements.modeBtn.title = view.modeTitle;
  elements.detailBtn.disabled = view.detailDisabled;
  return true;
}
