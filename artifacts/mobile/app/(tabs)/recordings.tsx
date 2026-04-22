import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Alert,
  FlatList,
  GestureResponderEvent,
  LayoutChangeEvent,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  Pressable,
} from "react-native";
import { WebView } from "react-native-webview";
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

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(str: string): string {
  const d = new Date(str);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Simple touch slider (no external deps) ───────────────────────────────────
function SimpleSlider({
  value,
  min = 0,
  max = 1,
  trackColor,
  onValueChange,
  onSlidingComplete,
}: {
  value: number;
  min?: number;
  max?: number;
  trackColor?: string;
  onValueChange?: (v: number) => void;
  onSlidingComplete?: (v: number) => void;
}) {
  const trackWidthRef = useRef(0);
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const calcValue = (evt: GestureResponderEvent) => {
    const x = evt.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(1, x / (trackWidthRef.current || 1)));
    return min + ratio * (max - min);
  };

  return (
    <View
      style={sliderStyles.track}
      onLayout={(e: LayoutChangeEvent) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => onValueChange?.(calcValue(e))}
      onResponderMove={(e) => onValueChange?.(calcValue(e))}
      onResponderRelease={(e) => { onSlidingComplete?.(calcValue(e)); onValueChange?.(calcValue(e)); }}
    >
      <View style={[sliderStyles.fill, { width: `${pct * 100}%`, backgroundColor: trackColor ?? "#ef4444" }]} />
      <View style={[sliderStyles.thumb, { left: `${pct * 100}%`, backgroundColor: trackColor ?? "#ef4444" }]} />
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  track: {
    height: 36,
    flex: 1,
    justifyContent: "center",
    position: "relative",
  },
  fill: {
    height: 3,
    borderRadius: 2,
    position: "absolute",
    left: 0,
  },
  thumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    position: "absolute",
    marginLeft: -7,
    top: "50%",
    marginTop: -7,
  },
});

// ── Mix Monitor Modal ─────────────────────────────────────────────────────────
function MixMonitorModal({ rec, onClose, colors }: {
  rec: RecordingItem;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [beatVol, setBeatVol] = useState(0.7);
  const [vocalVol, setVocalVol] = useState(0.85);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const webviewRef = useRef<WebView>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const vocalUrl = `https://${DOMAIN}/api/storage${rec.objectPath}`;

  // YouTube auto-play HTML injected into WebView (hidden player, just audio)
  const ytHtml = `<!DOCTYPE html><html><body style="margin:0;background:#000">
    <div id="p"></div>
    <script>
      var tag=document.createElement('script');
      tag.src='https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
      var player;
      window.onYouTubeIframeAPIReady=function(){
        player=new YT.Player('p',{
          videoId:'${rec.beatVideoId}',
          playerVars:{autoplay:0,controls:0,rel:0,modestbranding:1},
          events:{onReady:function(e){
            e.target.setVolume(${Math.round(beatVol * 100)});
            window.ReactNativeWebView.postMessage('ready');
          }}
        });
      };
      window.playBeat=function(){player&&player.playVideo()};
      window.pauseBeat=function(){player&&player.pauseVideo()};
      window.seekBeat=function(t){player&&player.seekTo(t,true)};
      window.setBeatVol=function(v){player&&player.setVolume(v)};
    </script>
  </body></html>`;

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
    const loadSound = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: vocalUrl },
          { shouldPlay: false, volume: vocalVol },
          (status) => {
            if (status.isLoaded) {
              setPosition((status.positionMillis ?? 0) / 1000);
              if (status.durationMillis) setDuration(status.durationMillis / 1000);
              if (status.didJustFinish) {
                setIsPlaying(false);
                webviewRef.current?.injectJavaScript("pauseBeat();true");
                webviewRef.current?.injectJavaScript("seekBeat(0);true");
                sound.setPositionAsync(0);
                setPosition(0);
              }
            }
          }
        );
        soundRef.current = sound;
        setLoaded(true);
      } catch (e) {
        console.error("MixPlayer load error", e);
      }
    };
    loadSound();
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      if (tickRef.current) clearInterval(tickRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlay = useCallback(async () => {
    if (!soundRef.current || !loaded) return;
    await soundRef.current.playAsync();
    webviewRef.current?.injectJavaScript("playBeat();true");
    setIsPlaying(true);
  }, [loaded]);

  const handlePause = useCallback(async () => {
    await soundRef.current?.pauseAsync();
    webviewRef.current?.injectJavaScript("pauseBeat();true");
    setIsPlaying(false);
  }, []);

  const handleToggle = useCallback(() => {
    isPlaying ? handlePause() : handlePlay();
  }, [isPlaying, handlePlay, handlePause]);

  const handleSeek = useCallback(async (val: number) => {
    await soundRef.current?.setPositionAsync(val * 1000);
    webviewRef.current?.injectJavaScript(`seekBeat(${val});true`);
    setPosition(val);
  }, []);

  const handleBeatVol = useCallback((val: number) => {
    setBeatVol(val);
    webviewRef.current?.injectJavaScript(`setBeatVol(${Math.round(val * 100)});true`);
  }, []);

  const handleVocalVol = useCallback(async (val: number) => {
    setVocalVol(val);
    await soundRef.current?.setVolumeAsync(val);
  }, []);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.mixModal, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.mixHeader, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.mixTitle, { color: colors.foreground }]}>Mix Monitor</Text>
            <Text style={[styles.mixSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {rec.beatTitle}
            </Text>
          </View>
          <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.muted }]}>
            <Feather name="x" size={18} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Hidden YouTube WebView */}
        <View style={{ height: 0, overflow: "hidden" }}>
          <WebView
            ref={webviewRef}
            source={{ html: ytHtml }}
            style={{ width: 1, height: 1 }}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            javaScriptEnabled
            onMessage={(e) => {
              if (e.nativeEvent.data === "ready") {
                // YouTube player ready
              }
            }}
          />
        </View>

        <View style={styles.mixBody}>
          {/* Thumbnail */}
          <Image
            source={{ uri: rec.beatThumbnailUrl }}
            style={styles.mixThumb}
            contentFit="cover"
          />

          {/* Seek bar */}
          <View style={styles.seekRow}>
            <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
              {formatDuration(Math.floor(position))}
            </Text>
            <SimpleSlider
              value={position}
              min={0}
              max={duration || 1}
              trackColor={colors.primary}
              onSlidingComplete={handleSeek}
              onValueChange={(v) => setPosition(v)}
            />
            <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
              {duration ? formatDuration(Math.floor(duration)) : "--:--"}
            </Text>
          </View>

          {/* Play/Pause */}
          <TouchableOpacity
            onPress={handleToggle}
            disabled={!loaded}
            style={[styles.playBtn, { backgroundColor: colors.primary, opacity: loaded ? 1 : 0.4 }]}
            activeOpacity={0.8}
          >
            <Feather name={isPlaying ? "pause" : "play"} size={28} color="#fff" />
          </TouchableOpacity>

          {/* Volume sliders */}
          <View style={[styles.volCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Beat */}
            <View style={styles.volRow}>
              <Feather name="music" size={14} color={colors.primary} />
              <Text style={[styles.volLabel, { color: colors.mutedForeground }]}>Beat</Text>
              <SimpleSlider
                value={beatVol}
                trackColor={colors.primary}
                onValueChange={handleBeatVol}
              />
              <Text style={[styles.volPct, { color: colors.mutedForeground }]}>
                {Math.round(beatVol * 100)}%
              </Text>
            </View>

            {/* Vocal */}
            <View style={styles.volRow}>
              <Feather name="mic" size={14} color="#ef4444" />
              <Text style={[styles.volLabel, { color: colors.mutedForeground }]}>Vocal</Text>
              <SimpleSlider
                value={vocalVol}
                trackColor="#ef4444"
                onValueChange={handleVocalVol}
              />
              <Text style={[styles.volPct, { color: colors.mutedForeground }]}>
                {Math.round(vocalVol * 100)}%
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Recording Card ────────────────────────────────────────────────────────────
function RecordingCard({
  item,
  colors,
  onDelete,
}: {
  item: RecordingItem;
  colors: ReturnType<typeof useColors>;
  onDelete: (rec: RecordingItem) => void;
}) {
  const [mixOpen, setMixOpen] = useState(false);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Image source={{ uri: item.beatThumbnailUrl }} style={styles.thumb} contentFit="cover" />
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
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMixOpen(true); }}
          activeOpacity={0.8}
        >
          <Feather name="layers" size={14} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.muted }]}
          onPress={() => onDelete(item)}
          activeOpacity={0.8}
        >
          <Feather name="trash-2" size={14} color={colors.destructive} />
        </TouchableOpacity>
      </View>

      {mixOpen && (
        <MixMonitorModal rec={item} onClose={() => setMixOpen(false)} colors={colors} />
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
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

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          <Text style={{ color: colors.primary }}>🎤 </Text>Recordings
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Tap <Feather name="layers" size={12} color={colors.mutedForeground} /> to mix beat + vocals
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
          renderItem={({ item }) => (
            <RecordingCard item={item} colors={colors} onDelete={handleDelete} />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 90,
          }}
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
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  card: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 10,
  },
  thumb: { width: 90, height: 90 },
  cardInfo: { flex: 1, padding: 10, gap: 4, justifyContent: "center" },
  cardTitle: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  cardDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardActions: { padding: 10, gap: 8, justifyContent: "center" },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  // Mix Modal
  mixModal: { flex: 1 },
  mixHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  mixTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  mixSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2, maxWidth: 260 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  mixBody: { flex: 1, paddingHorizontal: 24, paddingTop: 28, alignItems: "center", gap: 20 },
  mixThumb: { width: 180, height: 180, borderRadius: 16 },
  seekRow: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%" },
  slider: { flex: 1, height: 36 },
  timeText: { fontSize: 11, fontFamily: "Inter_500Medium", width: 38 },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  volCard: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  volRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  volLabel: { fontSize: 12, fontFamily: "Inter_500Medium", width: 38 },
  volSlider: { flex: 1, height: 36 },
  volPct: { fontSize: 11, fontFamily: "Inter_500Medium", width: 34, textAlign: "right" },
});
