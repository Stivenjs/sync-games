import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { CloudDownload, CloudUpload } from "lucide-react";

interface BulkActionConfirmModalProps {
  isOpen: boolean;
  type: "sync" | "download";
  count: number;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function BulkActionConfirmModal({
  isOpen,
  type,
  count,
  onConfirm,
  onClose,
}: BulkActionConfirmModalProps) {
  const isSync = type === "sync";
  const title = isSync
    ? "Subir guardados de todos los juegos"
    : "Descargar guardados de todos los juegos";
  const message = isSync
    ? `¿Subir guardados de ${count} ${count === 1 ? "juego" : "juegos"} a la nube?`
    : `¿Descargar guardados de ${count} ${count === 1 ? "juego" : "juegos"} desde la nube?`;

  const handleConfirm = async () => {
    await onConfirm();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange} placement="center">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          {isSync ? (
            <CloudUpload size={22} className="text-primary" />
          ) : (
            <CloudDownload size={22} className="text-primary" />
          )}
          {title}
        </ModalHeader>
        <ModalBody>
          <p className="text-default-600">{message}</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Cancelar
          </Button>
          <Button color="primary" onPress={handleConfirm}>
            {isSync ? "Subir todos" : "Descargar todos"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
