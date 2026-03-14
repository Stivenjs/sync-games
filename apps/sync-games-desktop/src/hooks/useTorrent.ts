import { useMutation } from "@tanstack/react-query";
import { startTorrentDownload, startTorrentFileDownload, cancelTorrent } from "@services/tauri";

export function useTorrent() {
  const startTorrentDownloadMutation = useMutation({
    mutationFn: ({ magnet, savePath }: { magnet: string; savePath: string }) => startTorrentDownload(magnet, savePath),
  });
  const startTorrentFileDownloadMutation = useMutation({
    mutationFn: ({ file, savePath }: { file: string; savePath: string }) => startTorrentFileDownload(file, savePath),
  });
  const cancelTorrentMutation = useMutation({
    mutationFn: ({ infoHash }: { infoHash: string }) => cancelTorrent(infoHash),
  });
  return {
    startTorrentDownloadMutation,
    startTorrentFileDownloadMutation,
    cancelTorrentMutation,
  };
}
