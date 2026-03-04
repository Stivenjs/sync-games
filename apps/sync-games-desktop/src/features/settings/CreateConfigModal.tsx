import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";

interface CreateConfigModalProps {
  isOpen: boolean;
  apiBaseUrl: string;
  apiKey: string;
  userId: string;
  error: string | null;
  creating: boolean;
  onApiBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onUserIdChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
}

export function CreateConfigModal({
  isOpen,
  apiBaseUrl,
  apiKey,
  userId,
  error,
  creating,
  onApiBaseUrlChange,
  onApiKeyChange,
  onUserIdChange,
  onClose,
  onSubmit,
}: CreateConfigModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="center"
      size="lg"
    >
      <ModalContent>
        <ModalHeader>Crear archivo de configuración</ModalHeader>
        <ModalBody className="gap-4">
          <p className="text-sm text-default-500">
            Introduce los datos de tu API. El archivo se creará en la carpeta de
            configuración de la app. Si ya existe, solo se actualizarán estos
            campos (se mantienen juegos y rutas).
          </p>
          <Input
            label="URL de la API (apiBaseUrl)"
            placeholder="https://tu-api.ejemplo.com"
            value={apiBaseUrl}
            onValueChange={onApiBaseUrlChange}
            variant="bordered"
          />
          <Input
            label="User ID (userId)"
            placeholder="tu-user-id"
            value={userId}
            onValueChange={onUserIdChange}
            variant="bordered"
          />
          <Input
            label="API Key (apiKey)"
            placeholder="tu-api-key"
            type="password"
            value={apiKey}
            onValueChange={onApiKeyChange}
            variant="bordered"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Cancelar
          </Button>
          <Button color="primary" onPress={onSubmit} isLoading={creating}>
            Crear archivo
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

