import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { FolderOpen, Home, ArrowUp, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

interface DirectoryItem {
  name: string;
  path: string;
  type: "directory" | "parent";
}

interface DirectoryBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

export function DirectoryBrowser({
  isOpen,
  onClose,
  onSelect,
  initialPath
}: DirectoryBrowserProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [directories, setDirectories] = useState<DirectoryItem[]>([]);
  const [homePath, setHomePath] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadDirectory(initialPath || "~");
    }
  }, [isOpen, initialPath]);

  const loadDirectory = async (path: string) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await api.get(`/browse-directory?path=${encodeURIComponent(path)}`) as any;

      if (response.success) {
        setCurrentPath(response.currentPath);
        setDirectories(response.directories);
        setHomePath(response.homePath);
      } else {
        setError(response.message || "Failed to load directory");
      }
    } catch (err) {
      setError("Failed to browse directory: " + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDirectoryClick = (dir: DirectoryItem) => {
    loadDirectory(dir.path);
  };

  const handleSelectCurrent = () => {
    onSelect(currentPath);
    onClose();
  };

  const handleHomeClick = () => {
    loadDirectory(homePath || "~");
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Select Project Directory</DialogTitle>
          <DialogDescription>
            Navigate to your project directory and click "Select This Directory"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Path Display */}
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <FolderOpen className="h-4 w-4" />
            <span className="text-sm font-mono flex-1 overflow-x-auto">
              {currentPath}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleHomeClick}
              disabled={isLoading}
              title="Go to Home"
            >
              <Home className="h-4 w-4" />
            </Button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Directory List */}
          <div className="border rounded-lg max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                Loading directories...
              </div>
            ) : directories.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No subdirectories found
              </div>
            ) : (
              <div className="divide-y">
                {directories.map((dir, index) => (
                  <button
                    key={index}
                    onClick={() => handleDirectoryClick(dir)}
                    className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors flex items-center gap-3"
                  >
                    {dir.type === "parent" ? (
                      <ArrowUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-mono text-sm">
                      {dir.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSelectCurrent}
            disabled={isLoading}
          >
            <Check className="mr-2 h-4 w-4" />
            Select This Directory
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}