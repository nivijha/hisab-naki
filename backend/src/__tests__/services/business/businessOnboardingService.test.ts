import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBusinessOnboardingService, type BusinessOnboardingRepository, type CreatedBusiness } from '../../../services/business/businessOnboardingService.js';
import { HttpError } from '../../../middleware/authenticate.js';

class FakeBusinessRepository implements BusinessOnboardingRepository {
  calls: Array<{ userId: string; name: string; key: string; hash: string }> = [];
  result: CreatedBusiness = {
    business: { id: 'server-business-id', name: 'Alpha Shop', currency: 'INR' },
    membership: { membershipId: 'server-membership-id', businessId: 'server-business-id', role: 'OWNER', status: 'ACTIVE' },
    replayed: false,
  };
  async createFirstBusiness(userId: string, name: string, key: string, hash: string) {
    this.calls.push({ userId, name, key, hash });
    return this.result;
  }
}

describe('business onboarding service', () => {
  it('passes normalized shop name and server-side request hash with idempotency key', async () => {
    const repository = new FakeBusinessRepository();
    const service = createBusinessOnboardingService(repository);
    const result = await service.createFirstBusiness('authenticated-user', '  Nivi Kirana  ', 'onboard-req-123');
    assert.equal(result.business.id, 'server-business-id');
    assert.deepEqual(repository.calls, [{
      userId: 'authenticated-user',
      name: 'Nivi Kirana',
      key: 'onboard-req-123',
      hash: '8c10413d5662463b5a3727fe34462cf32eb444f8282d81b88fbf689e6aced4c0',
    }]);
  });

  it('rejects missing user, missing idempotency key, and invalid shop name', async () => {
    const service = createBusinessOnboardingService(new FakeBusinessRepository());
    assert.throws(() => service.createFirstBusiness('', 'Shop', 'onboard-req-123'), error => error instanceof HttpError && error.statusCode === 401);
    assert.throws(() => service.createFirstBusiness('u1', 'Shop', ''), error => error instanceof HttpError && error.statusCode === 400);
    assert.throws(() => service.createFirstBusiness('u1', ' ', 'onboard-req-123'), error => error instanceof HttpError && error.statusCode === 400);
  });
});
