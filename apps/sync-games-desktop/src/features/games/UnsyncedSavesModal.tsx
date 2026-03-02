import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { CloudUpload } from "lucide-react";
import { formatGameDisplayName } from "@utils/gameImage";

interface UnsyncedSavesModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameIds: string[];
  onUploadAll: () => void;
  isLoading?: boolean;
}

export function UnsyncedSavesModal({
  isOpen,
  onClose,
  gameIds,
  onUploadAll,
  isLoading = false,
}: UnsyncedSavesModalProps) {
  if (gameIds.length === 0) return null;

  const gameNames = gameIds.map(formatGameDisplayName).join(", ");
  const summary =
    gameIds.length === 1
      ? `Tienes guardados nuevos en ${gameNames}.`
      : `Tienes guardados nuevos en ${gameIds.length} juegos: ${gameNames}`;

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContent>
        <ModalHeader className="flex gap-2">
          <CloudUpload size={22} />
          Guardados sin subir
        </ModalHeader>
        <ModalBody>
          <p className="text-default-600">{summary}</p>
          <p className="text-sm text-default-500">
            ¿Quieres subirlos a la nube ahora?
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={isLoading}>
            Omitir
          </Button>
          <Button
            color="primary"
            startContent={<CloudUpload size={18} />}
            onPress={onUploadAll}
            isLoading={isLoading}
          >
            Subir todos
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
