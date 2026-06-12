import { buildBabyjub } from "circomlibjs";

let _babyjub;

export async function getBabyjub() {
  if (!_babyjub) _babyjub = await buildBabyjub();
  return _babyjub;
}
