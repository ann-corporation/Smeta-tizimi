import { beforeEach } from 'vitest';
import { vakolatKeshTozala } from './functions/_shared/role-authority';

// Vakolat keshi (60 s) bir testdagi DB javobini keyingi testga olib o'tmasin.
beforeEach(() => vakolatKeshTozala());
