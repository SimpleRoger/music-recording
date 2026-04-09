import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
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
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";

const STORAGE_KEY = "tubefeed_lyrics";

interface Lyric {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function LyricsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [lyrics, setLyrics] = useState<Lyric[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLyric, setEditingLyric] = useState<Lyric | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const loadLyrics = useCallback(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) setLyrics(JSON.parse(raw));
  }, []);

  useEffect(() => { loadLyrics(); }, [loadLyrics]);

  const saveLyrics = async (updated: Lyric[]) => {
    setLyrics(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const handleOpen = (lyric?: Lyric) => {
    if (lyric) {
      setEditingLyric(lyric);
      setTitle(lyric.title);
      setContent(lyric.content);
    } else {
      setEditingLyric(null);
      setTitle("");
      setContent("");
    }
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (editingLyric) {
      const updated = lyrics.map((l) =>
        l.id === editingLyric.id ? { ...l, title: title.trim(), content: content.trim() } : l
      );
      await saveLyrics(updated);
    } else {
      const newLyric: Lyric = {
        id: genId(),
        title: title.trim(),
        content: content.trim(),
        createdAt: new Date().toISOString(),
      };
      await saveLyrics([newLyric, ...lyrics]);
    }
    setModalVisible(false);
  };

  const handleDelete = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await saveLyrics(lyrics.filter((l) => l.id !== id));
  };

  const filtered = searchQuery
    ? lyrics.filter(
        (l) =>
          l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : lyrics;

  const renderItem = ({ item }: { item: Lyric }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => handleOpen(item)}
      activeOpacity={0.85}
    >
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.content ? (
          <Text style={[styles.cardPreview, { color: colors.mutedForeground }]} numberOfLines={2}>
            {item.content}
          </Text>
        ) : null}
        <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
          {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(item.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="trash-2" size={16} color={colors.destructive} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          <Text style={{ color: colors.primary }}>📝 </Text>Lyrics
        </Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => handleOpen()}
        >
          <Feather name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {lyrics.length > 0 && (
        <View style={[styles.searchRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search lyrics…"
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Feather name="x" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {lyrics.length === 0 ? (
        <View style={{ flex: 1, paddingBottom: bottomPad }}>
          <EmptyState
            icon="file-text"
            title="No lyrics yet"
            subtitle="Save your lyrics and verses here for easy access while recording"
            actionLabel="Add Lyrics"
            onAction={() => handleOpen()}
          />
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, paddingBottom: bottomPad }}>
          <EmptyState icon="search" title="No results" subtitle={`No lyrics matching "${searchQuery}"`} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(l) => l.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 90,
          }}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingLyric ? "Edit" : "New Lyrics"}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={!title.trim()}>
              <Text style={[styles.modalSave, { color: title.trim() ? colors.primary : colors.mutedForeground }]}>
                Save
              </Text>
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <TextInput
              style={[styles.titleInput, { color: colors.foreground, borderBottomColor: colors.border }]}
              placeholder="Title"
              placeholderTextColor={colors.mutedForeground}
              value={title}
              onChangeText={setTitle}
              autoFocus
              returnKeyType="next"
            />
            <TextInput
              style={[styles.contentInput, { color: colors.foreground }]}
              placeholder="Write your lyrics here…"
              placeholderTextColor={colors.mutedForeground}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
            />
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
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
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  cardPreview: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  cardDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  deleteBtn: { padding: 4 },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  modalCancel: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  modalSave: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  titleInput: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contentInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 16,
    paddingTop: 14,
    lineHeight: 24,
  },
});
