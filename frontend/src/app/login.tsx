import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, H4, Input, Paragraph, YStack } from 'tamagui';

import { apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { FORM_MAX_WIDTH, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

export default function LoginScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { setAuthenticated } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        setAuthenticated(true);
        router.replace('/');
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Invalid password');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <YStack
      items="center"
      justify="center"
      p={SPACING.MEDIUM}
      style={{ flex: 1, backgroundColor: palette.background }}
    >
      <YStack
        p={SPACING.LARGE}
        maxW={FORM_MAX_WIDTH}
        style={{
          width: '100%',
          gap: SPACING.MEDIUM,
          backgroundColor: palette.surface,
        }}
      >
        <H4 text="center" style={{ color: palette.textPrimary }}>
          Login
        </H4>

        {error ? (
          <Paragraph style={{ color: palette.error }}>{error}</Paragraph>
        ) : null}

        <Input
          placeholder="Password"
          value={password}
          type="password"
          onChangeText={setPassword}
          secureTextEntry
          autoFocus
          onSubmitEditing={handleSubmit}
        />

        <Button disabled={loading || !password} onPress={handleSubmit}>
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </YStack>
    </YStack>
  );
}
