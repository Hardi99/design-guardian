'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiClient, type Project } from '@/lib/api/client';
import Link from 'next/link';
import { Plus, FolderKanban, Loader2, FileImage, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ProjectWithStats extends Project {
  assetsCount: number;
  versionsCount: number;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const rawProjects = await apiClient.getProjects(user.id);

      const projectsWithStats = await Promise.all(
        rawProjects.map(async (project) => {
          try {
            const assets = await apiClient.getAssets(project.id);
            let versionsCount = 0;
            for (const asset of assets) {
              const versions = await apiClient.getVersions(asset.id);
              versionsCount += versions.length;
            }
            return { ...project, assetsCount: assets.length, versionsCount };
          } catch {
            return { ...project, assetsCount: 0, versionsCount: 0 };
          }
        })
      );

      setProjects(projectsWithStats);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      await apiClient.createProject(newProjectName, user.id);
      setNewProjectName('');
      loadProjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Chargement...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">
          Gérez vos assets design et suivez les changements
        </p>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <FolderKanban className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{projects.length}</p>
                <p className="text-sm text-muted-foreground">Projets</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <FileImage className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {projects.reduce((sum, p) => sum + p.assetsCount, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Assets</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {projects.reduce((sum, p) => sum + p.versionsCount, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Versions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Project */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Nouveau Projet</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateProject} className="flex gap-3">
            <Input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Nom du projet..."
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={creating || !newProjectName.trim()}
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {creating ? 'Création...' : 'Créer'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Projects List */}
      <div>
        <h2 className="font-display text-lg font-semibold mb-4">Vos Projets</h2>
        {projects.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-border">
            <FolderKanban className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Aucun projet. Créez-en un pour commencer !
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="h-full card-hover transition-all hover:border-primary/30">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="rounded-lg bg-primary/10 p-2">
                        <FolderKanban className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">{project.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          Créé le{' '}
                          {new Date(project.created_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground border-t border-border pt-3">
                      <span className="flex items-center gap-1.5">
                        <FileImage className="h-3.5 w-3.5" />
                        {project.assetsCount} asset{project.assetsCount > 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5" />
                        {project.versionsCount} version{project.versionsCount > 1 ? 's' : ''}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
