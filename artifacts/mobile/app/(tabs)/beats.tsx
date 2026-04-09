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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddChannelModal } from "@/components/AddChannelModal";
import { EmptyState } from "@/components/EmptyState";
import { VideoCard } from "@/components/VideoCard";
import { useColors } from "@/hooks/useColors";
import {
  getListBeatChannelsQueryKey,
  getListBeatsQueryKey,
  useListBeatChannels,
  useListBeats,
  useRemoveBeatChannel,
  useSearchBeats,
  type Channel,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function BeatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [managingChannels, setManagingChannels] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<"channels" | "search">("channels");

  const { data: beatChannels = [] } = useListBeatChannels();
  const { data: beats = [], isLoading: isLoadingBeats, refetch: refetchBeats } = useListBeats({
    channelId: mode === "channels" && selectedChannelId !== null ? selectedChannelId : undefined,
  });
  const { data: searchResults = [], isFetching: isSearching } = useSearchBeats(
    { q: activeSearch },
    { enabled: mode === "search" && activeSearch.length >= 2 }
  );

  const removeChannel = useRemoveBeatChannel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBeatChannelsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListBeatsQueryKey() });
        setSelectedChannelId(null);
      },
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetchBeats();
    setRefreshing(false);
  };

  const handleRemoveChannel = (ch: Channel) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    removeChannel.mutate({ id: ch.id });
  };

  const handleSearch = () => {
    setActiveSearch(searchQuery);
    setMode("search");
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveSearch("");
    setMode("channels");
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;
  const displayVideos = mode === "search" ? searchResults : beats;
  const isLoading = mode === "search" ? isSearching : isLoadingBeats;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          <Text style={{ color: colors.primary }}>🎵 </Text>Beats
        </Text>
        <View style={styles.headerActions}>
          {beatChannels.length > 0 && (
            <TouchableOpacity onPress={() => setManagingChannels((v) => !v)} style={styles.headerBtn}>
              <Feather name={managingChannels ? "check" : "settings"} size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => setAddModalVisible(true)}
          >
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.searchRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Feather name="search" size={15} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search beats on YouTube…"
          placeholderTextColor={colors.mutedForeground}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        {mode === "search" ? (
          <TouchableOpacity onPress={handleClearSearch}>
            <Feather name="x" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      {mode === "channels" && beatChannels.length > 0 && (
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
            onPress={() => { Haptics.selectionAsync(); setSelectedChannelId(null); }}
          >
            <Text style={[styles.chipText, { color: selectedChannelId === null ? colors.primaryForeground : colors.mutedForeground }]}>
              All
            </Text>
          </TouchableOpacity>
          {beatChannels.map((ch) => (
            <TouchableOpacity
              key={ch.id}
              style={[
                styles.chip,
                selectedChannelId === ch.id && { backgroundColor: colors.primary },
                selectedChannelId !== ch.id && { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 },
              ]}
              onPress={() => { Haptics.selectionAsync(); setSelectedChannelId(ch.id); }}
            >
              <Text
                style={[styles.chipText, { color: selectedChannelId === ch.id ? colors.primaryForeground : colors.foreground }]}
                numberOfLines={1}
              >
                {ch.name}
              </Text>
              {managingChannels && (
                <TouchableOpacity onPress={() => handleRemoveChannel(ch)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                  <Feather name="x" size={12} color={selectedChannelId === ch.id ? colors.primaryForeground : colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {mode === "channels" && beatChannels.length === 0 ? (
        <View style={{ flex: 1, paddingBottom: bottomPad }}>
          <EmptyState
            icon="music"
            title="No beat channels yet"
            subtitle="Add YouTube channels with beats to browse them here"
            actionLabel="Add Beat Channel"
            onAction={() => setAddModalVisible(true)}
          />
        </View>
      ) : isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Feather name="loader" size={24} color={colors.mutedForeground} />
        </View>
      ) : displayVideos.length === 0 ? (
        <View style={{ flex: 1, paddingBottom: bottomPad }}>
          <EmptyState
            icon="music"
            title={mode === "search" ? "No results" : "No beats found"}
            subtitle={mode === "search" ? "Try a different search term" : "No recent beats from this channel"}
          />
        </View>
      ) : (
        <FlatList
          data={displayVideos}
          keyExtractor={(v) => v.videoId}
          renderItem={({ item }) => <VideoCard video={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 90 }}
          refreshControl={
            mode === "channels" ? (
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
            ) : undefined
          }
        />
      )}

      <AddChannelModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        type="beat"
        existingChannels={beatChannels}
      />
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
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerBtn: { padding: 6 },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
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
});
