let rememberSession = true;

export function setRememberSession(remember) {
  rememberSession = remember;
}

export const authStorage = {
  getItem(key) {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  },
  setItem(key, value) {
    const target = rememberSession ? localStorage : sessionStorage;
    const other = rememberSession ? sessionStorage : localStorage;
    target.setItem(key, value);
    other.removeItem(key);
  },
  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};
