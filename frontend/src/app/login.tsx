import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  getServerUrl,
  normalizeServerUrl,
  setServerUrl,
} from '../lib/serverUrl';
import { FONT_SIZES, FORM_MAX_WIDTH, SPACING } from '../styles/styleConsts';
import { useTheme } from '../styles/useTheme';

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const palette = theme.colors;
  const { setAuthenticated } = useAuth();
  // Web is served by the backend (same origin), so there's no server to enter —
  // the field and its handling are native-only.
  const isWeb = Platform.OS === 'web';
  // Prefill with the saved server (returning user) or the dev default.
  const [server, setServer] = useState(getServerUrl());
  // The server is device config, not a credential, and it's already persisted
  // (serverUrl.ts). Hiding it once configured keeps the login form a single
  // password field, so password managers don't autofill the (first) text field
  // as a username and clobber the saved server. First run / "Change server"
  // re-shows it.
  const [showServerField, setShowServerField] = useState(
    !isWeb && !getServerUrl(),
  );
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!isWeb) {
      const url = normalizeServerUrl(server);
      if (!/^https?:\/\/.+/i.test(url)) {
        setError('Enter a server address like https://photos.example.com');
        return;
      }
      // Persist + switch the active server before logging in, so apiFetch
      // targets the address the user just entered.
      await setServerUrl(url);
    }
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
      setError(
        isWeb
          ? "Couldn't reach the server."
          : `Couldn't reach ${normalizeServerUrl(server)}. Check the server address.`,
      );
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: palette.background,
      borderWidth: Math.max(theme.hairline, 1),
      borderColor: palette.divider,
      borderRadius: theme.radius.control,
      color: palette.textPrimary,
    },
  ];
  const submitDisabled = loading || !password || (!isWeb && !server);

  return (
    <View
      style={[styles.screen, { backgroundColor: palette.background }]}
    >
      <View style={[styles.card, theme.surfaces.card]}>
        <Text style={[styles.title, { color: palette.textPrimary }]}>
          Login
        </Text>

        {error ? (
          <Text style={[styles.error, { color: palette.error }]}>{error}</Text>
        ) : null}

        {showServerField ? (
          <TextInput
            placeholder="Server address (https://...)"
            placeholderTextColor={palette.textSecondary}
            value={server}
            onChangeText={setServer}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            // Tell password managers this is a URL, not a username, so they
            // don't autofill it and overwrite the server address.
            textContentType="URL"
            autoComplete="off"
            autoFocus={!server}
            style={inputStyle}
          />
        ) : null}

        <TextInput
          placeholder="Password"
          placeholderTextColor={palette.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          // Let password managers offer/save the password for this login.
          textContentType="password"
          autoComplete="password"
          autoFocus={isWeb || !showServerField}
          onSubmitEditing={handleSubmit}
          style={inputStyle}
        />

        <Pressable
          disabled={submitDisabled}
          onPress={handleSubmit}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            {
              backgroundColor: palette.primary,
              borderRadius: theme.radius.control,
              opacity: submitDisabled ? 0.5 : pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text style={[styles.submitLabel, { color: palette.primaryContrast }]}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Text>
        </Pressable>

        {!isWeb && !showServerField ? (
          <Pressable
            onPress={() => setShowServerField(true)}
            style={({ pressed }) => [
              styles.changeServer,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text
              style={[styles.changeServerLabel, { color: palette.textSecondary }]}
            >
              Change server
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.MEDIUM,
  },
  card: {
    width: '100%',
    maxWidth: FORM_MAX_WIDTH,
    padding: SPACING.LARGE,
    gap: SPACING.MEDIUM,
  },
  title: {
    fontSize: FONT_SIZES.LARGE,
    fontWeight: '600',
    textAlign: 'center',
  },
  error: {
    fontSize: FONT_SIZES.SMALL,
  },
  input: {
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.SMALL,
    fontSize: FONT_SIZES.MEDIUM,
  },
  submit: {
    alignItems: 'center',
    paddingVertical: SPACING.SMALL,
  },
  submitLabel: {
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
  },
  changeServer: {
    alignItems: 'center',
    paddingVertical: SPACING.TINY,
  },
  changeServerLabel: {
    fontSize: FONT_SIZES.SMALL,
  },
});
