import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';
import { httpsCallableMessage } from './callableError';

export type AppCodeKnowledgeMeta = {
  ready: boolean;
  fileCount: number;
  builtAt: string | null;
  model?: string;
};

export type AppCodeKnowledgeAnswer = {
  answer: string;
  sources: string[];
  model: string;
  modelFallback?: boolean;
  indexBuiltAt: string | null;
  filesInIndex: number;
};

export type AppCodeKnowledgeAuth = {
  ownerId?: string;
};

export async function fetchAppCodeKnowledgeMeta(
  auth?: AppCodeKnowledgeAuth
): Promise<AppCodeKnowledgeMeta> {
  const fn = httpsCallable<AppCodeKnowledgeAuth, AppCodeKnowledgeMeta>(
    cloudFunctions,
    'getAppCodeKnowledgeMeta'
  );
  const result = await fn(auth?.ownerId ? { ownerId: auth.ownerId } : {});
  return result.data;
}

export async function askAppCodeKnowledge(
  question: string,
  auth?: AppCodeKnowledgeAuth
): Promise<AppCodeKnowledgeAnswer> {
  const fn = httpsCallable<{ question: string; ownerId?: string }, AppCodeKnowledgeAnswer>(
    cloudFunctions,
    'askAppCodeKnowledge'
  );
  try {
    const result = await fn({
      question: question.trim(),
      ...(auth?.ownerId ? { ownerId: auth.ownerId } : {}),
    });
    return result.data;
  } catch (err) {
    throw new Error(httpsCallableMessage(err, 'App Code Knowledge could not answer.'));
  }
}
