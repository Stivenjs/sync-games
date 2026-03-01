import { useEffect, useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { addGame } from "@services/tauri";

interface AddGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialPath?: string;
  suggestedId?: string;
}

export function AddGameModal({
  isOpen,
  onClose,
  onSuccess,
  initialPath = "",
  suggestedId = "",
}: AddGameModalProps) {
  const [gameId, setGameId] = useState(suggestedId);
  const [path, setPath] = useState(initialPath);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setGameId(suggestedId);
      setPath(initialPath);
    }
  }, [isOpen, suggestedId, initialPath]);

  const handleBrowseFolder = async () => {
    setError(null);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Seleccionar carpeta de guardados",
      });
      if (selected && typeof selected === "string") {
        setPath(selected);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setError(null);
      setGameId("");
      setPath("");
      onClose();
    }
  };

  const handleSubmit = async () => {
    const id = gameId.trim();
    const p = path.trim();
    if (!id || !p) {
      setError("Identificador y ruta son obligatorios.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await addGame(id, p);
      onSuccess();
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange} placement="center">
      <ModalContent>
        <ModalHeader>Añadir juego</ModalHeader>
        <ModalBody className="gap-4">
          <Input
            label="Identificador del juego"
            placeholder="ej. elden-ring"
            value={gameId}
            onValueChange={setGameId}
            description="Un nombre único para identificar el juego (minúsculas, guiones)"
            variant="bordered"
          />
          <Input
            label="Ruta de la carpeta de guardados"
            placeholder="Selecciona una carpeta o escribe la ruta"
            value={path}
            onValueChange={setPath}
            variant="bordered"
            isInvalid={!!error}
            errorMessage={error}
            endContent={
              <Button
                isIconOnly
                variant="flat"
                size="sm"
                aria-label="Seleccionar carpeta"
                onPress={handleBrowseFolder}
              >
                <FolderOpen size={18} />
              </Button>
            }
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Cancelar
          </Button>
          <Button
            color="primary"
            onPress={handleSubmit}
            isLoading={loading}
            isDisabled={!gameId.trim() || !path.trim()}
          >
            Añadir
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
