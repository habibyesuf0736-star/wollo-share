/* Two device-side hints: whether the welcome screens have been seen on this install, and
   which accounts have already been walked through the tutorial. Neither one authorises
   anything — the server still decides what an account may see or take. */

const INTRO_KEY = "wollo_app_intro_v1";
const TUTORIAL_KEY = "wollo_app_tutorial_v1";

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the welcome simply shows again */
  }
}

export function hasSeenIntro() {
  return read(INTRO_KEY) === "1";
}

export function markIntroSeen() {
  write(INTRO_KEY, "1");
}

function walked() {
  try {
    const list = JSON.parse(read(TUTORIAL_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function hasSeenTutorial(userId) {
  return walked().includes(String(userId || "device"));
}

export function markTutorialSeen(userId) {
  const key = String(userId || "device");
  const list = walked().filter((item) => item !== key);
  list.push(key);
  write(TUTORIAL_KEY, JSON.stringify(list.slice(-20)));
}
