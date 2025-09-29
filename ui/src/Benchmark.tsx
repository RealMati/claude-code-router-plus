import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { Toast } from "@/components/ui/toast";
import { Play, FolderOpen, Terminal, Copy, Check, ArrowLeft } from "lucide-react";
import { DirectoryBrowser } from "@/components/DirectoryBrowser";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

interface Provider {
  id: string;
  name: string;
  models: { id: string; name: string }[];
}

interface BenchmarkModel {
  provider: string;
  model: string;
  selected: boolean;
}

function Benchmark() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projectPath, setProjectPath] = useState("");
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState<BenchmarkModel[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [launchResults, setLaunchResults] = useState<string[]>([]);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showDirectoryBrowser, setShowDirectoryBrowser] = useState(false);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      const config = await api.getConfig() as any;
      const providerList: Provider[] = [];

      if (config.Providers && Array.isArray(config.Providers)) {
        // Convert Providers array to the format we need
        config.Providers.forEach((provider: any) => {
          if (provider && provider.name && provider.models && Array.isArray(provider.models)) {
            providerList.push({
              id: provider.name.toLowerCase(),
              name: provider.name,
              models: provider.models.map((modelId: string) => ({
                id: modelId,
                name: modelId
              }))
            });
          }
        });
      }

      setProviders(providerList);

      // Initialize models array
      const modelsList: BenchmarkModel[] = [];
      providerList.forEach(provider => {
        provider.models.forEach(model => {
          modelsList.push({
            provider: provider.id,
            model: model.id,
            selected: false
          });
        });
      });
      setModels(modelsList);
    } catch (error) {
      console.error("Failed to fetch providers:", error);
      setToast({
        message: "Failed to load providers: " + (error as Error).message,
        type: 'error'
      });
    }
  };

  const handleSelectDirectory = () => {
    setShowDirectoryBrowser(true);
  };

  const handleDirectorySelected = (path: string) => {
    setProjectPath(path);
    setShowDirectoryBrowser(false);
  };

  const toggleModel = (index: number) => {
    const updatedModels = [...models];
    updatedModels[index].selected = !updatedModels[index].selected;
    setModels(updatedModels);
  };

  const selectAllModels = () => {
    const allSelected = models.every(m => m.selected);
    setModels(models.map(m => ({ ...m, selected: !allSelected })));
  };

  const handleLaunchBenchmark = async () => {
    // Validation
    const selectedModels = models.filter(m => m.selected);

    if (!projectPath.trim()) {
      setToast({ message: "Please specify a project directory", type: 'error' });
      return;
    }

    if (selectedModels.length === 0) {
      setToast({ message: "Please select at least one model", type: 'error' });
      return;
    }

    if (!prompt.trim()) {
      setToast({ message: "Please enter a prompt", type: 'error' });
      return;
    }

    setIsLaunching(true);
    setLaunchResults([]);

    try {
      // Call the benchmark API endpoint
      const response = await api.post('/benchmark/launch', {
        projectPath: projectPath.trim(),
        prompt: prompt.trim(),
        models: selectedModels
      }) as any;

      if (response.success) {
        setToast({
          message: `Successfully launched ${response.launched} terminal${response.launched > 1 ? 's' : ''}`,
          type: 'success'
        });

        // Display the commands that were launched
        if (response.commands && response.commands.length > 0) {
          setLaunchResults(response.commands);
          setShowResultsDialog(true);
        }
      } else {
        setToast({
          message: response.message || "Failed to launch benchmark",
          type: 'error'
        });
      }
    } catch (error) {
      console.error("Failed to launch benchmark:", error);
      setToast({
        message: "Failed to launch benchmark: " + (error as Error).message,
        type: 'error'
      });
    } finally {
      setIsLaunching(false);
    }
  };

  const copyCommand = (command: string, index: number) => {
    navigator.clipboard.writeText(command);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Model Benchmark
          </CardTitle>
          <CardDescription>
            Launch multiple Claude Code instances with different models to benchmark performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Project Directory Selection */}
          <div className="space-y-2">
            <Label htmlFor="projectPath">Project Directory</Label>
            <div className="flex gap-2">
              <Input
                id="projectPath"
                placeholder="/Users/username/path/to/project"
                value={projectPath}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProjectPath(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleSelectDirectory}
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Browse
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the full absolute path to the directory where Claude Code will be launched (e.g., /Users/leul/projects/myapp)
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Select Models to Test</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllModels}
              >
                {models.every(m => m.selected) ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-4 max-h-64 overflow-y-auto">
                  {models.map((model, index) => (
                    <div key={`${model.provider}-${model.model}`} className="flex items-center space-x-2">
                      <Checkbox
                        id={`model-${index}`}
                        checked={model.selected}
                        onCheckedChange={() => toggleModel(index)}
                      />
                      <Label
                        htmlFor={`model-${index}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {model.provider}/{model.model}
                      </Label>
                    </div>
                  ))}
                  {models.length === 0 && (
                    <p className="col-span-2 text-sm text-muted-foreground text-center">
                      No models configured. Please configure providers first.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Prompt Input */}
          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              placeholder="Enter your benchmark prompt here..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-sm text-muted-foreground">
              This prompt will be sent to all selected models
            </p>
          </div>

          {/* Launch Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleLaunchBenchmark}
              disabled={isLaunching || models.filter(m => m.selected).length === 0}
              size="lg"
            >
              {isLaunching ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Launching...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Launch Benchmark
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Dialog */}
      <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Benchmark Launched</DialogTitle>
            <DialogDescription>
              The following commands were executed in separate terminals:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-4">
            {launchResults.map((command, index) => (
              <div key={index} className="relative">
                <pre className="bg-muted p-3 rounded-lg text-sm overflow-x-auto pr-12">
                  <code>{command}</code>
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={() => copyCommand(command, index)}
                >
                  {copiedIndex === index ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowResultsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Directory Browser Dialog */}
      <DirectoryBrowser
        isOpen={showDirectoryBrowser}
        onClose={() => setShowDirectoryBrowser(false)}
        onSelect={handleDirectorySelected}
        initialPath={projectPath || "~"}
      />

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default Benchmark;