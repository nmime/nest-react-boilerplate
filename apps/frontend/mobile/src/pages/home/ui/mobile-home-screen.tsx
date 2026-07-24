import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { designColors, designRadii, designSpacing } from '@app/frontend-ui-native';
import { useI18n, type Locale } from '@app/frontend-runtime';

import { useMobileRuntime } from '../../../shared/mobile-runtime';
import { mobileCapabilityCards, mobileLocaleOptions } from '../model/mobile-home.model';

const colors = designColors.light;

export function MobileHomeScreen() {
  const { locale, t } = useI18n();
  const { applyUserLocale, persistUserLocale, userLocale } = useMobileRuntime();
  const activeLocale = userLocale ?? locale;

  const selectLocale = (next: Locale) => {
    applyUserLocale(next);
    void persistUserLocale(next);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{t('mobile.status')}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {t('mobile.appName')}
          </Text>
          <Text style={styles.subtitle}>{t('mobile.subtitle')}</Text>
          <View accessibilityRole="radiogroup" style={styles.langRow}>
            {mobileLocaleOptions.map((option) => {
              const selected = activeLocale === option.locale;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.locale}
                  onPress={() => {
                    selectLocale(option.locale);
                  }}
                  style={[styles.langButton, selected && styles.langButtonActive]}
                >
                  <Text style={[styles.langButtonText, selected && styles.langButtonTextActive]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelAccent} />
          <Text style={styles.panelLabel}>{t('mobile.api.label')}</Text>
          <Text style={styles.panelValue}>{t('mobile.api.value')}</Text>
        </View>

        <View style={styles.grid}>
          {mobileCapabilityCards.map((card) => (
            <View key={card.labelKey} style={styles.card}>
              <View style={styles.cardAccent} />
              <Text style={styles.cardLabel}>{t(card.labelKey)}</Text>
              <Text style={styles.cardValue}>{t(card.valueKey)}</Text>
              <Text style={styles.cardDetail}>{t(card.detailKey)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  page: {
    flexGrow: 1,
    alignSelf: 'center',
    maxWidth: 760,
    width: '100%',
    padding: designSpacing[6],
  },
  header: {
    marginBottom: designSpacing[6],
  },
  langRow: {
    flexDirection: 'row',
    gap: designSpacing[2],
    marginTop: designSpacing[4],
  },
  langButton: {
    borderColor: colors.border,
    borderRadius: designRadii.sm,
    borderWidth: 1,
    paddingHorizontal: designSpacing[4],
    paddingVertical: designSpacing[2],
  },
  langButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  langButtonText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '700',
  },
  langButtonTextActive: {
    color: '#ffffff',
  },
  eyebrow: {
    alignSelf: 'flex-start',
    borderRadius: designRadii.sm,
    backgroundColor: '#dbeafe',
    color: '#1e3a8a',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: designSpacing[3],
    paddingHorizontal: designSpacing[3],
    paddingVertical: designSpacing[2],
    textTransform: 'uppercase',
  },
  title: {
    color: colors.foreground,
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 44,
    marginBottom: designSpacing[3],
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: 17,
    lineHeight: 24,
  },
  panel: {
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: designRadii.md,
    borderWidth: 1,
    marginBottom: designSpacing[4],
    padding: designSpacing[5],
  },
  panelAccent: {
    backgroundColor: '#2563eb',
    height: 4,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  panelLabel: {
    color: colors.mutedForeground,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: designSpacing[2],
    textTransform: 'uppercase',
  },
  panelValue: {
    color: colors.cardForeground,
    fontSize: 22,
    fontWeight: '800',
  },
  grid: {
    marginBottom: designSpacing[5],
  },
  card: {
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: designRadii.md,
    borderWidth: 1,
    marginBottom: designSpacing[3],
    padding: designSpacing[4],
  },
  cardAccent: {
    backgroundColor: '#f59e0b',
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 4,
  },
  cardLabel: {
    color: colors.mutedForeground,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: designSpacing[2],
    textTransform: 'uppercase',
  },
  cardValue: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: designSpacing[2],
  },
  cardDetail: {
    color: colors.mutedForeground,
    fontSize: 14,
    lineHeight: 20,
  },
});
