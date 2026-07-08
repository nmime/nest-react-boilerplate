import {
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  designColors,
  designRadii,
  designSpacing,
} from "@app/frontend-ui-native";

import {
  mobileCapabilityCards,
  mobileRuntime,
} from "../model/mobile-home.model";

const colors = designColors.light;

const openApiBaseUrl = (): string =>
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "same-origin";

export function MobileHomeScreen() {
  const apiBaseUrl = openApiBaseUrl();
  const openConfiguredApi = (): void => {
    void Linking.openURL(apiBaseUrl === "same-origin" ? "/" : apiBaseUrl);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View style={styles.statusRow}>
            <Text style={styles.eyebrow}>{mobileRuntime.status}</Text>
            <Text style={styles.platforms}>
              {mobileRuntime.platforms.join(" / ")}
            </Text>
          </View>
          <Text style={styles.title}>{mobileRuntime.appName}</Text>
          <Text style={styles.subtitle}>
            Shared account shell for installed apps, Expo web, and the Docker
            web export.
          </Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelAccent} />
          <Text style={styles.panelLabel}>API target</Text>
          <Text style={styles.panelValue}>Configured endpoint</Text>
          <Text style={styles.panelHint}>{apiBaseUrl}</Text>
        </View>

        <View style={styles.grid}>
          {mobileCapabilityCards.map((card) => (
            <View key={card.label} style={styles.card}>
              <View style={styles.cardAccent} />
              <Text style={styles.cardLabel}>{card.label}</Text>
              <Text style={styles.cardValue}>{card.value}</Text>
              <Text style={styles.cardDetail}>{card.detail}</Text>
            </View>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={openConfiguredApi}
          style={styles.primaryAction}
        >
          <Text style={styles.primaryActionText}>Open configured API</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
  page: {
    flexGrow: 1,
    alignSelf: "center",
    maxWidth: 760,
    width: "100%",
    padding: designSpacing[6],
  },
  header: {
    marginBottom: designSpacing[6],
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: designSpacing[2],
    marginBottom: designSpacing[3],
  },
  eyebrow: {
    borderRadius: designRadii.sm,
    backgroundColor: "#dcfce7",
    color: "#14532d",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: designSpacing[3],
    paddingVertical: designSpacing[2],
    textTransform: "uppercase",
  },
  platforms: {
    color: colors.mutedForeground,
    fontSize: 13,
    fontWeight: "700",
  },
  title: {
    color: colors.foreground,
    fontSize: 38,
    fontWeight: "800",
    lineHeight: 44,
    marginBottom: designSpacing[3],
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: 17,
    lineHeight: 24,
  },
  panel: {
    overflow: "hidden",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: designRadii.md,
    borderWidth: 1,
    marginBottom: designSpacing[4],
    padding: designSpacing[5],
  },
  panelAccent: {
    backgroundColor: "#2563eb",
    height: 4,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  panelLabel: {
    color: colors.mutedForeground,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: designSpacing[2],
    textTransform: "uppercase",
  },
  panelValue: {
    color: colors.cardForeground,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: designSpacing[2],
  },
  panelHint: {
    color: colors.mutedForeground,
    fontSize: 14,
    lineHeight: 20,
  },
  grid: {
    marginBottom: designSpacing[5],
  },
  card: {
    overflow: "hidden",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: designRadii.md,
    borderWidth: 1,
    marginBottom: designSpacing[3],
    padding: designSpacing[4],
  },
  cardAccent: {
    backgroundColor: "#f59e0b",
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
    width: 4,
  },
  cardLabel: {
    color: colors.mutedForeground,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: designSpacing[2],
    textTransform: "uppercase",
  },
  cardValue: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: designSpacing[2],
  },
  cardDetail: {
    color: colors.mutedForeground,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryAction: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: designRadii.sm,
    paddingHorizontal: designSpacing[5],
    paddingVertical: designSpacing[4],
  },
  primaryActionText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: "800",
  },
});
