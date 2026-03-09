import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { Archive } from "lucide-react";
import { formatGameDisplayName } from "@utils/gameImage";
import type { ConfiguredGame } from "@app-types/config";

interface FullBackupConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: ConfiguredGame | null;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function FullBackupConfirmModal({
  isOpen,
  onClose,
  game,
  onConfirm,
  isLoading = false,
}: FullBackupConfirmModalProps) {
  const gameName = game ? formatGameDisplayName(game.id) : "";

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <Archive size={22} className="text-primary" />
          Empaquetar y subir (backup completo)
        </ModalHeader>
        <ModalBody className="space-y-4">
          {game && (
            <p className="text-default-600">
              Vas a crear un <strong>backup completo</strong> de{" "}
              <strong>{gameName}</strong> y subirlo a la nube.
            </p>
          )}
          <div className="rounded-lg bg-default-100 p-4 text-sm text-default-600">
            <p className="font-medium text-foreground">
              ¿Para qué sirve esta opción?
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>
                Se empaqueta toda la carpeta del juego en un solo archivo .tar
                (sin comprimir, para que sea más rápido).
              </li>
              <li>
                Ese archivo se sube a la nube en una única operación, en lugar
                de miles de archivos sueltos.
              </li>
              <li>
                Es la opción recomendada para juegos con muchos archivos o
                guardados muy pesados: va más rápido y evita saturar la
                sincronización normal.
              </li>
              <li>
                Después puedes restaurar ese backup desde &quot;Restaurar desde
                backup&quot; → pestaña &quot;En la nube&quot;.
              </li>
            </ul>
          </div>
          <p className="text-default-500">
            ¿Quieres continuar y empaquetar ahora la carpeta de este juego para
            subirla a la nube?
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose} isDisabled={isLoading}>
            Cancelar
          </Button>
          <Button
            color="primary"
            onPress={onConfirm}
            isLoading={isLoading}
            isDisabled={isLoading}
            startContent={!isLoading ? <Archive size={18} /> : undefined}
          >
            Sí, empaquetar y subir
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
