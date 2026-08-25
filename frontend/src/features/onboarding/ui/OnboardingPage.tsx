'use client';

import { useDictionary } from '@/app/[lang]/Providers';

export default function OnboardingPage() {
  const dict = useDictionary();

  return <p data-testid="onboarding-placeholder">{dict.onboarding.placeholder}</p>;
}
