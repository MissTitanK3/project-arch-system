import { listDocsReferences } from "../core/docs/listDocs";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export async function docsList(): Promise<OperationResult<{ refs: string[] }>> {
  return wrap(async () => ({ refs: await listDocsReferences() }));
}
