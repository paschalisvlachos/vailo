import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';
import { httpsCallableMessage } from './callableError';

export type ProvisionOwnerAuthInput = {
  ownerId: string;
  email: string;
  status: string;
  password?: string;
  previousEmail?: string;
};

export type ProvisionOwnerAuthResult = {
  uid: string;
  created: boolean;
};

export async function provisionOwnerAuth(
  input: ProvisionOwnerAuthInput
): Promise<ProvisionOwnerAuthResult> {
  const fn = httpsCallable<ProvisionOwnerAuthInput, ProvisionOwnerAuthResult>(
    cloudFunctions,
    'provisionOwnerAuth'
  );
  try {
    const result = await fn(input);
    return result.data;
  } catch (error) {
    throw new Error(
      httpsCallableMessage(error, 'Failed to set up Vailo Admin login for this user.')
    );
  }
}
