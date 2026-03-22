import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Chip,
  ScrollShadow,
  Divider,
} from "@heroui/react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState, useRef } from "react";
import { Trash2 } from "lucide-react";
import { getPluginLogs, PluginLogEntry } from "@/services/tauri/config.service";

interface PluginLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PluginLogsModal({ isOpen, onClose }: PluginLogsModalProps) {
  const [logs, setLogs] = useState<PluginLogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    getPluginLogs().then(setLogs).catch(console.error);

    const unlisten = listen<PluginLogEntry>("plugin_log", (event) => {
      setLogs((prev) => [...prev, event.payload]);
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleClear = () => setLogs([]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="3xl"
      scrollBehavior="inside"
      classNames={{
        base: "max-h-[80vh]",
        body: "p-0",
      }}>
      <ModalContent>
        <ModalHeader className="flex items-center justify-between pr-10">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">Logs de plugins</span>
            {logs.length > 0 && (
              <Chip size="sm" variant="flat" color="default">
                {logs.length}
              </Chip>
            )}
          </div>
        </ModalHeader>

        <Divider />

        <ModalBody>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-default-400">
              <span className="text-sm">No hay logs todavía</span>
              <span className="text-xs text-default-300">Los mensajes de tus plugins aparecerán aquí</span>
            </div>
          ) : (
            <ScrollShadow className="h-[480px]">
              <div className="flex flex-col font-mono text-xs">
                {logs.map((entry, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 px-4 py-2 border-b border-default-100 last:border-0 ${
                      entry.level === "error" ? "bg-danger-50/40 dark:bg-danger-900/10" : ""
                    }`}>
                    <span className="text-default-400 shrink-0 pt-px">{entry.timestamp}</span>
                    <Chip
                      size="sm"
                      variant="flat"
                      color={entry.level === "error" ? "danger" : "success"}
                      classNames={{ base: "shrink-0 h-5 min-w-12", content: "text-[10px] px-1.5" }}>
                      {entry.level}
                    </Chip>
                    <span className="text-primary-400 shrink-0 pt-px">[{entry.plugin}]</span>
                    <span
                      className={`break-all ${
                        entry.level === "error"
                          ? "text-danger-600 dark:text-danger-400"
                          : "text-default-700 dark:text-default-300"
                      }`}>
                      {entry.message}
                    </span>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </ScrollShadow>
          )}
        </ModalBody>

        <Divider />

        <ModalFooter className="flex justify-between">
          <Button
            size="sm"
            variant="light"
            color="danger"
            startContent={<Trash2 size={14} />}
            onPress={handleClear}
            isDisabled={logs.length === 0}>
            Limpiar
          </Button>
          <Button size="sm" variant="flat" onPress={onClose}>
            Cerrar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
