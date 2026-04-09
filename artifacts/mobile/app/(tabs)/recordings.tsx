import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";
import {
  getListRecordingsQueryKey,
  useDeleteRecording,
  useListRecordings,
  type RecordingItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(str: string): string {
  const d = new Date(str);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function RecordingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: recordings = [], isLoading, refetch } = useListRecordings();

  const deleteRecording = useDeleteRecording({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRecordingsQueryKey() });
      },
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleDelete = (rec: RecordingItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Delete Recording", `Delete freestyle over "${rec.beatTitle}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteRecording.mutate({ id: rec.id }),
      },
    ]);
  };

  const handlePlay = (rec: RecordingItem) => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (domain) {
      WebBrowser.openBrowserAsync(`https://${domain}/api/storage${rec.objectPath}`);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const renderItem = ({ item }: { item: RecordingItem }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Image
        source={{ uri: item.beatThumbnailUrl }}
        style={styles.thumb}
        contentFit="cover"
      />
      <View style={styles.cardInfo}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
          {item.beatTitle}
        </Text>
        <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
          {item.beatChannelName}
        </Text>
        <View style={styles.cardMeta}>
          <View style={[styles.badge, { backgroundColor: colors.muted }]}>
            <Feather name="mic" size={10} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
              {formatDuration(item.durationSeconds)}
            </Text>
          </View>
          <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={() => handlePlay(item)}
          activeOpacity={0.8}
        >
          <Feather name="play" size={14} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.muted }]}
          onPress={() => handleDelete(item)}
          activeOpacity={0.8}
        >
          <Feather name="trash-2" size={14} color={colors.destructive} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          <Text style={{ color: colors.primary }}>🎤 </Text>Recordings
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Feather name="loader" size={24} color={colors.mutedForeground} />
        </View>
      ) : recordings.length === 0 ? (
        <View style={{ flex: 1, paddingBottom: bottomPad }}>
          <EmptyState
            icon="mic"
            title="No recordings yet"
            subtitle="Record freestyles over beats in the Beats tab to save them here"
          />
        </View>
      ) : (
        <FlatList
          data={recordings}
          keyExtractor={(r) => String(r.id)}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 12, paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 90 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  card: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 10,
  },
  thumb: {
    width: 90,
    height: 90,
  },
  cardInfo: {
    flex: 1,
    padding: 10,
    gap: 4,
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  cardSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  cardDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  cardActions: {
    padding: 10,
    gap: 8,
    justifyContent: "center",
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
