declare module "download-git-repo" {
  export function download(
    repository: string,
    destination: string,
    options: { clone: boolean }
  ): Promise<void>;
}
