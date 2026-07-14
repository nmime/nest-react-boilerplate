import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { TestModule } from './test.module';

describe('TestModule', () => {
  it('compiles as a Nest module', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    expect(moduleRef.get(TestModule)).toBeInstanceOf(TestModule);
  });
});
