"use client";

export type MicProbeResult = {
  ok: boolean;
  secure: boolean;
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
  isIOS: boolean;
  isHarmonyOS: boolean;
  isTablet: boolean;
  reason?: "need_https" | "unsupported" | "no_media_recorder" | "denied" | "unknown";
  detail?: string;
};

export function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Huawei / HarmonyOS（含鸿蒙 4.x 平板，UA 可能仍带 Android） */
export function isHarmonyOSDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /HarmonyOS/i.test(ua) ||
    /HuaweiBrowser/i.test(ua) ||
    (/HUAWEI|HONOR|HWI-/i.test(ua) && /Android/i.test(ua))
  );
}

export function isAndroidDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/** 手机 / 平板（含华为鸿蒙、iPad、Android 平板） */
export function isTouchMobileDevice() {
  if (typeof navigator === "undefined") return false;
  if (isIOSDevice() || isHarmonyOSDevice()) return true;
  if (isAndroidDevice()) return true;
  return navigator.maxTouchPoints > 1 && !/Windows NT/i.test(navigator.userAgent);
}

/**
 * 平板/手机浏览器在异步播放音频后，需用户再点一次才能稳定打开麦克风。
 * 适用于 iPad、华为鸿蒙平板、Android 平板等。
 */
export function needsFollowTapAfterListen() {
  return isTouchMobileDevice();
}

export function isMicAvailable() {
  if (typeof window === "undefined") return false;
  return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
}

function deviceFlags() {
  const isIOS = isIOSDevice();
  const isHarmonyOS = isHarmonyOSDevice();
  const isTablet = isTouchMobileDevice();
  return { isIOS, isHarmonyOS, isTablet };
}

export async function probeMicAccess(): Promise<MicProbeResult> {
  const secure = typeof window !== "undefined" && window.isSecureContext;
  const hasGetUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);
  const hasMediaRecorder = typeof MediaRecorder !== "undefined";
  const { isIOS, isHarmonyOS, isTablet } = deviceFlags();

  if (!secure) {
    return {
      ok: false,
      secure,
      hasGetUserMedia,
      hasMediaRecorder,
      isIOS,
      isHarmonyOS,
      isTablet,
      reason: "need_https",
      detail: "平板需用 https 地址访问（电脑 localhost 可用，局域网 IP 必须用 https）",
    };
  }
  if (!hasGetUserMedia) {
    return {
      ok: false,
      secure,
      hasGetUserMedia,
      hasMediaRecorder,
      isIOS,
      isHarmonyOS,
      isTablet,
      reason: "unsupported",
      detail: "当前浏览器不支持麦克风",
    };
  }
  if (!hasMediaRecorder) {
    return {
      ok: false,
      secure,
      hasGetUserMedia,
      hasMediaRecorder,
      isIOS,
      isHarmonyOS,
      isTablet,
      reason: "no_media_recorder",
      detail: "当前浏览器不支持录音，请换用 Chrome 或系统自带浏览器并更新到最新版",
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true, secure, hasGetUserMedia, hasMediaRecorder, isIOS, isHarmonyOS, isTablet };
  } catch (e) {
    const err = e as DOMException;
    return {
      ok: false,
      secure,
      hasGetUserMedia,
      hasMediaRecorder,
      isIOS,
      isHarmonyOS,
      isTablet,
      reason: err.name === "NotAllowedError" ? "denied" : "unknown",
      detail:
        err.name === "NotAllowedError"
          ? "麦克风权限被拒绝，请在系统或浏览器设置中允许"
          : err.message || "无法打开麦克风",
    };
  }
}

export function micHelpMessage(probe: MicProbeResult, host?: string) {
  const ip = host || (typeof window !== "undefined" ? window.location.hostname : "电脑IP");
  if (probe.reason === "need_https") {
    return `平板请用 https 打开：电脑执行 npm run dev:pad，平板访问 https://${ip}:3000/child（首次需信任证书）`;
  }
  if (probe.reason === "denied") {
    if (probe.isHarmonyOS) {
      return "请在 设置 → 应用和服务 → 权限管理 中允许浏览器使用麦克风，或在地址栏权限里开启";
    }
    if (probe.isIOS) {
      return "请在 设置 → Safari → 麦克风 中允许，或在地址栏左侧开启权限";
    }
    return "请在系统设置或浏览器地址栏权限中允许麦克风";
  }
  if (probe.reason === "no_media_recorder") {
    if (probe.isHarmonyOS) {
      return "华为/鸿蒙平板请使用 Chrome 或系统浏览器，并更新 HarmonyOS 与浏览器到最新版";
    }
    return "请更新系统与浏览器到最新版本";
  }
  return probe.detail || "麦克风不可用";
}
