import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, H4, Input, Paragraph, YStack } from 'tamagui';

import { apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  getServerUrl,
  normalizeServerUrl,
  setServerUrl,
} from '../lib/serverUrl';
import { FORM_MAX_WIDTH, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

export default function LoginScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { setAuthenticated } = useAuth();
  // Prefill with the saved server (returning user) or the dev default.
  const [server, setServer] = useState(getServerUrl());
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    const url = normalizeServerUrl(server);
    if (!/^https?:\/\/.+/i.test(url)) {
      setError('Enter a server address like https://photos.example.com');
      return;
    }
    setLoading(true);
    // Persist + switch the active server before logging in, so apiFetch targets
    // the address the user just entered.
    await setServerUrl(url);
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
      setError(`Couldn't reach ${url}. Check the server address.`);
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
          placeholder="Server address (https://...)"
          value={server}
          onChangeText={setServer}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
          autoFocus={!server}
        />

        <Input
          placeholder="Password"
          value={password}
          type="password"
          onChangeText={setPassword}
          secureTextEntry
          autoFocus={!!server}
          onSubmitEditing={handleSubmit}
        />

        <Button
          disabled={loading || !server || !password}
          onPress={handleSubmit}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </YStack>
    </YStack>
  );
}
