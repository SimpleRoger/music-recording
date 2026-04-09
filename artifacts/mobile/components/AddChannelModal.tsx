import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  useAddBeatChannel,
  useAddChannel,
  useSearchBeatChannels,
  useSearchChannels,
  type Channel,
  type ChannelSearchResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListBeatChannelsQueryKey,
  getListChannelsQueryKey,
} from "@workspace/api-client-react";

interface AddChannelModalProps {
  visible: boolean;
  onClose: () => void;
  type: "channel" | "beat";
  existingChannels: Channel[];
}

export function AddChannelModal({ visible, onClose, type, existingChannels }: AddChannelModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();

  const isBeat = type === "beat";

  const { data: channelResults, isFetching: isSearching } = useSearchChannels(
    { q: query },
    { enabled: !isBeat && query.length >= 2 }
  );
  const { data: beatResults, isFetching: isSearchingBeats } = useSearchBeatChannels(
    { q: query },
    { enabled: isBeat && query.length >= 2 }
  );

  const results: ChannelSearchResult[] = (isBeat ? beatResults : channelResults) ?? [];
  const isFetching = isBeat ? isSearchingBeats : isSearching;

  const addChannel = useAddChannel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() });
      },
    },
  });
  const addBeatChannel = useAddBeatChannel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBeatChannelsQueryKey() });
      },
    },
  });

  const existingIds = new Set(existingChannels.map((c) => c.youtubeChannelId));

  const handleAdd = (item: ChannelSearchResult) => {
    if (isBeat) {
      addBeatChannel.mutate({ youtubeChannelId: item.youtubeChannelId });
    } else {
      addChannel.mutate({ youtubeChannelId: item.youtubeChannelId });
    }
  };

  const handleClose = () => {
    setQuery("");
    onClose();
  };

  const renderItem = ({ item }: { item: ChannelSearchResult }) => {
    const isAdded = existingIds.has(item.youtubeChannelId);
    return (
      <View style={[styles.resultRow, { borderBottomColor: colors.border }]}>
        <View style={styles.resultInfo}>
          <Text style={[styles.resultName, { color: colors.foreground }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.subscriberCount ? (
            <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>
              {item.subscriberCount} subscribers
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={[
            styles.addBtn,
            { backgroundColor: isAdded ? colors.muted : colors.primary },
          ]}
          onPress={() => !isAdded && handleAdd(item)}
          disabled={isAdded}
          activeOpacity={0.8}
        >
          <Feather name={isAdded ? "check" : "plus"} size={14} color={isAdded ? colors.mutedForeground : colors.primaryForeground} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <KeyboardAvoidingView
        style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
            {isBeat ? "Add Beat Channel" : "Add Channel"}
          </Text>
          <TouchableOpacity onPress={handleClose}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <View style={[styles.searchRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder={isBeat ? "Search beat channels…" : "Search channels…"}
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {isFetching && <ActivityIndicator size="small" color={colors.primary} />}
        </View>

        {query.length < 2 ? (
          <View style={styles.hint}>
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              Type at least 2 characters to search
            </Text>
          </View>
        ) : results.length === 0 && !isFetching ? (
          <View style={styles.hint}>
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>No results found</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.youtubeChannelId}
            renderItem={renderItem}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    maxHeight: "75%",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#444",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  hint: {
    paddingVertical: 32,
    alignItems: "center",
  },
  hintText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  list: {
    flex: 1,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  resultSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
});
