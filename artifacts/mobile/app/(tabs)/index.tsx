import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddChannelModal } from "@/components/AddChannelModal";
import { EmptyState } from "@/components/EmptyState";
import { VideoCard } from "@/components/VideoCard";
import { VideoPlayerModal } from "@/components/VideoPlayerModal";
import type { Video } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import {
  getListChannelsQueryKey,
  getListVideosQueryKey,
  useListChannels,
  useListVideos,
  useRemoveChannel,
  type Channel,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [managingChannels, setManagingChannels] = useState(false);
  const [playerVideo, setPlayerVideo] = useState<Video | null>(null);
  const [order, setOrder] = useState<"recent" | "popular">("recent");

  const { data: channels = [] } = useListChannels();
  const { data: videos = [], isLoading, refetch } = useListVideos({
    channelId: selectedChannelId ?? undefined,
    order,
  });

  const removeChannel = useRemoveChannel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
        setSelectedChannelId(null);
      },
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleChannelSelect = (id: number | null) => {
    Haptics.selectionAsync();
    setSelectedChannelId(id);
  };

  const handleRemoveChannel = (ch: Channel) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    removeChannel.mutate({ id: ch.id });
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const headerHeight = topPad + 52;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <Text style={[styles.logo, { color: colors.foreground }]}>
          <Text style={{ color: colors.primary }}>Tube</Text>Feed
        </Text>
        <View style={styles.headerActions}>
          {channels.length > 0 && (
            <>
              <View style={[styles.orderToggle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.orderBtn, order === "recent" && { backgroundColor: colors.primary }]}
                  onPress={() => setOrder("recent")}
                >
                  <Text style={[styles.orderBtnText, { color: order === "recent" ? "#fff" : colors.mutedForeground }]}>
                    Recent
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.orderBtn, order === "popular" && { backgroundColor: colors.primary }]}
                  onPress={() => setOrder("popular")}
                >
                  <Text style={[styles.orderBtnText, { color: order === "popular" ? "#fff" : colors.mutedForeground }]}>
                    Popular
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => setManagingChannels((v) => !v)}
              >
                <Feather name={managingChannels ? "check" : "settings"} size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => setAddModalVisible(true)}
          >
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {channels.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.chips, { borderBottomColor: colors.border }]}
          contentContainerStyle={styles.chipsContent}
        >
          <TouchableOpacity
            style={[
              styles.chip,
              selectedChannelId === null && { backgroundColor: colors.primary },
              selectedChannelId !== null && { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 },
            ]}
            onPress={() => handleChannelSelect(null)}
          >
            <Text
              style={[
                styles.chipText,
                { color: selectedChannelId === null ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              All
            </Text>
          </TouchableOpacity>
          {channels.map((ch) => (
            <TouchableOpacity
              key={ch.id}
              style={[
                styles.chip,
                selectedChannelId === ch.id && { backgroundColor: colors.primary },
                selectedChannelId !== ch.id && { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 },
              ]}
              onPress={() => handleChannelSelect(ch.id)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: selectedChannelId === ch.id ? colors.primaryForeground : colors.foreground },
                ]}
                numberOfLines={1}
              >
                {ch.name}
              </Text>
              {managingChannels && (
                <TouchableOpacity
                  onPress={() => handleRemoveChannel(ch)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Feather name="x" size={12} color={selectedChannelId === ch.id ? colors.primaryForeground : colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {channels.length === 0 ? (
        <View style={{ flex: 1, paddingBottom: bottomPad }}>
          <EmptyState
            icon="youtube"
            title="No channels yet"
            subtitle="Add your favourite YouTube channels to start watching their latest videos"
            actionLabel="Add Channel"
            onAction={() => setAddModalVisible(true)}
          />
        </View>
      ) : isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Feather name="loader" size={24} color={colors.mutedForeground} />
        </View>
      ) : videos.length === 0 ? (
        <View style={{ flex: 1, paddingBottom: bottomPad }}>
          <EmptyState
            icon="video-off"
            title="No videos"
            subtitle={order === "popular" ? "No popular videos found for this channel" : "No recent videos found for this channel"}
          />
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(v) => v.videoId}
          renderItem={({ item }) => <VideoCard video={item} onPress={setPlayerVideo} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 90 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}

      <AddChannelModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        type="channel"
        existingChannels={channels}
      />
      <VideoPlayerModal video={playerVideo} onClose={() => setPlayerVideo(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  logo: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerBtn: {
    padding: 6,
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  chips: {
    maxHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexGrow: 0,
  },
  chipsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    maxWidth: 120,
  },
  orderToggle: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  orderBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  orderBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
});
