from __future__ import annotations

import os
import sys
from pathlib import Path
from datetime import datetime


OUTPUT_PREFIX = "dump_consolidado"
SEPARATOR = "=" * 100

# ======================================================================================
# CONFIGURAÇÕES
# ======================================================================================

# Diretórios a ignorar pelo NOME da pasta
IGNORED_DIR_NAMES = {
    "__pycache__",
    ".git",
    ".idea",
    ".vscode",
    "node_modules",
    "venv",
    "editor",
    "assets",
    ".venv",
    "three",
    "dist",
    "build",
}

# Diretórios a ignorar pelo CAMINHO COMPLETO
# Exemplo:
# Path(r"C:\MeuProjeto\pasta_ignorada").resolve()
IGNORED_DIR_PATHS: set[Path] = set()

# Extensões de arquivo a ignorar
# Sempre em minúsculo e com ponto
IGNORED_FILE_EXTENSIONS = {
    ".exe",
    ".dll",
    ".pyd",
    ".pyc",
    ".obj",
    ".fbx",
    ".uasset",
    ".umap",
    ".pem",
    ".png",
    ".txt",
    ".jpg",
    ".jpeg",
    ".gif",
    ".bmp",
    ".tga",
    ".ico",
    ".mp3",
    ".wav",
    ".ogg",
    ".mp4",
    ".avi",
    ".mov",
    ".zip",
    ".rar",
    ".bat",
    ".7z",
    ".py",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
}

# Se True, arquivos sem extensão também serão ignorados
IGNORE_FILES_WITHOUT_EXTENSION = False


# ======================================================================================
# REGRAS DE FILTRO
# ======================================================================================

def should_ignore_dir(dir_path: Path) -> bool:
    try:
        resolved = dir_path.resolve()
    except Exception:
        resolved = dir_path

    if dir_path.name in IGNORED_DIR_NAMES:
        return True

    if resolved in IGNORED_DIR_PATHS:
        return True

    return False


def should_ignore_file(file_path: Path) -> bool:
    suffix = file_path.suffix.lower()

    if not suffix and IGNORE_FILES_WITHOUT_EXTENSION:
        return True

    if suffix in IGNORED_FILE_EXTENSIONS:
        return True

    return False


# ======================================================================================
# LEITURA DE ARQUIVO
# ======================================================================================

def is_probably_binary(file_path: Path, chunk_size: int = 4096) -> bool:
    try:
        with file_path.open("rb") as f:
            chunk = f.read(chunk_size)
        return b"\x00" in chunk
    except Exception:
        return False


def read_text_file(file_path: Path) -> tuple[str | None, str | None]:
    encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252"]

    for enc in encodings:
        try:
            content = file_path.read_text(encoding=enc)
            return content, enc
        except Exception:
            continue

    return None, None


# ======================================================================================
# COLETA
# ======================================================================================

def collect_files(paths: list[Path]) -> list[Path]:
    collected: list[Path] = []

    for path in paths:
        if not path.exists():
            print(f"[AVISO] Caminho não existe: {path}")
            continue

        if path.is_file():
            if should_ignore_file(path):
                print(f"[IGNORADO] Arquivo por extensão: {path}")
                continue

            collected.append(path)
            continue

        if path.is_dir():
            if should_ignore_dir(path):
                print(f"[IGNORADO] Diretório raiz ignorado: {path}")
                continue

            for root, dirs, files in os.walk(path):
                root_path = Path(root)

                # poda diretórios ignorados antes de entrar neles
                dirs[:] = [
                    d for d in dirs
                    if not should_ignore_dir(root_path / d)
                ]

                for file_name in files:
                    file_path = root_path / file_name

                    if should_ignore_file(file_path):
                        continue

                    collected.append(file_path)

    unique_sorted = sorted(set(p.resolve() for p in collected), key=lambda p: str(p).lower())
    return unique_sorted


# ======================================================================================
# SAÍDA
# ======================================================================================

def build_output_file_path() -> Path:
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    return Path.cwd() / f"{OUTPUT_PREFIX}_{timestamp}.txt"


def write_dump(files: list[Path], output_file: Path) -> None:
    total = len(files)

    with output_file.open("w", encoding="utf-8", newline="\n") as out:
        out.write("DUMP CONSOLIDADO DE ARQUIVOS\n")
        out.write(f"Gerado em: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        out.write(f"Total de arquivos encontrados: {total}\n")
        out.write(f"Arquivo de saída: {output_file}\n")
        out.write(f"Diretórios ignorados por nome: {sorted(IGNORED_DIR_NAMES)}\n")

        if IGNORED_DIR_PATHS:
            out.write("Diretórios ignorados por caminho:\n")
            for ignored_path in sorted(str(p) for p in IGNORED_DIR_PATHS):
                out.write(f" - {ignored_path}\n")

        out.write(f"Extensões ignoradas: {sorted(IGNORED_FILE_EXTENSIONS)}\n")
        out.write(f"Ignorar arquivos sem extensão: {IGNORE_FILES_WITHOUT_EXTENSION}\n")
        out.write(f"{SEPARATOR}\n\n")

        for index, file_path in enumerate(files, start=1):
            parent_dir = str(file_path.parent)
            file_name = file_path.name
            full_path = str(file_path)

            out.write(f"[{index}]\n")
            out.write(f"Nome do arquivo : {file_name}\n")
            out.write(f"Diretório       : {parent_dir}\n")
            out.write(f"Caminho completo: {full_path}\n")

            if is_probably_binary(file_path):
                out.write("Status          : ARQUIVO BINÁRIO / CONTEÚDO NÃO EXIBIDO\n")
                out.write(f"\n{SEPARATOR}\n\n")
                continue

            content, encoding_used = read_text_file(file_path)

            if content is None:
                out.write("Status          : NÃO FOI POSSÍVEL LER O CONTEÚDO COMO TEXTO\n")
                out.write(f"\n{SEPARATOR}\n\n")
                continue

            out.write(f"Encoding        : {encoding_used}\n")
            out.write("\n--- INÍCIO DO CONTEÚDO ---\n")
            out.write(content)

            if not content.endswith("\n"):
                out.write("\n")

            out.write("--- FIM DO CONTEÚDO ---\n")
            out.write(f"\n{SEPARATOR}\n\n")


# ======================================================================================
# MAIN
# ======================================================================================

def main() -> None:
    if len(sys.argv) < 2:
        print("Arrasta arquivos e/ou pastas em cima deste script.")
        print("Também dá pra rodar pelo terminal passando os caminhos.")
        input("\nPressiona Enter pra sair...")
        return

    input_paths = [Path(arg).expanduser() for arg in sys.argv[1:]]
    files = collect_files(input_paths)

    if not files:
        print("Nenhum arquivo encontrado nos caminhos informados.")
        input("\nPressiona Enter pra sair...")
        return

    output_file = build_output_file_path()
    write_dump(files, output_file)

    print(f"\nDump gerado com sucesso:")
    print(output_file)
    print(f"\nTotal de arquivos processados: {len(files)}")
    input("\nPressiona Enter pra sair...")


if __name__ == "__main__":
    main()