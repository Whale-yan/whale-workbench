#!/usr/bin/env python3
"""
批量去除PNG图标白边
策略：将接近纯白（RGB>245）且位于图标外围的像素设为透明
同时保留图标内部可能存在的浅色细节
"""
from PIL import Image
import os
from pathlib import Path

def remove_white_border(img_path, output_path, white_threshold=250, border_tolerance=2):
    """
    去除PNG白边
    white_threshold: RGB高于此值视为白色
    border_tolerance: 边缘容差，处理边缘渐变
    """
    img = Image.open(img_path).convert("RGBA")
    pixels = img.load()
    width, height = img.size
    
    # 第一步：创建遮罩，标记哪些像素是"白色/近白色"
    mask = [[False for _ in range(height)] for _ in range(width)]
    
    for x in range(width):
        for y in range(height):
            r, g, b, a = pixels[x, y]
            # 只处理不透明的像素
            if a > 10:
                # 判断是否接近白色（所有通道都很高）
                if r > white_threshold and g > white_threshold and b > white_threshold:
                    mask[x][y] = True
    
    # 第二步：找到图标主体区域（非白色像素的边界框）
    # 先找到所有非白色不透明像素的范围
    min_x, min_y = width, height
    max_x, max_y = -1, -1
    
    for x in range(width):
        for y in range(height):
            r, g, b, a = pixels[x, y]
            if a > 10 and not mask[x][y]:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    
    # 如果没找到主体，返回原图（不太可能）
    if max_x < 0:
        img.save(output_path)
        return
    
    # 第三步：扩展边界框，给主体留一点边距（保留描边如深绿色边）
    padding = 3  # 保留3像素边距，避免切掉深绿色描边
    min_x = max(0, min_x - padding)
    min_y = max(0, min_y - padding)
    max_x = min(width - 1, max_x + padding)
    max_y = min(height - 1, max_y + padding)
    
    # 第四步：裁剪到主体区域+边距
    cropped = img.crop((min_x, min_y, max_x + 1, max_y + 1))
    
    # 第五步：在裁剪后的图上，把残留的纯白像素设为透明
    cw, ch = cropped.size
    cpixels = cropped.load()
    
    for x in range(cw):
        for y in range(ch):
            r, g, b, a = cpixels[x, y]
            if a > 10:
                # 如果是纯白/近白，设为透明
                if r > white_threshold and g > white_threshold and b > white_threshold:
                    cpixels[x, y] = (255, 255, 255, 0)
                # 同时处理接近白色的浅灰
                elif abs(int(r) - int(g)) < 5 and abs(int(g) - int(b)) < 5 and r > 240:
                    cpixels[x, y] = (255, 255, 255, 0)
    
    # 第六步：去除完全透明的边框（trim透明边）
    # 重新计算非透明边界
    min_tx, min_ty = cw, ch
    max_tx, max_ty = -1, -1
    
    for x in range(cw):
        for y in range(ch):
            r, g, b, a = cpixels[x, y]
            if a > 10:
                min_tx = min(min_tx, x)
                min_ty = min(min_ty, y)
                max_tx = max(max_tx, x)
                max_ty = max(max_ty, y)
    
    if max_tx >= 0:
        # 再加2像素边距，防止切太干净
        min_tx = max(0, min_tx - 2)
        min_ty = max(0, min_ty - 2)
        max_tx = min(cw - 1, max_tx + 2)
        max_ty = min(ch - 1, max_ty + 2)
        final = cropped.crop((min_tx, min_ty, max_tx + 1, max_ty + 1))
    else:
        final = cropped
    
    # 保存
    final.save(output_path, "PNG")
    print(f"  处理完成: {os.path.basename(output_path)} -> {final.size}")

def main():
    icons_dir = Path("E:/搭子/鲸鱼工作台/assets/icons")
    backup_dir = Path("E:/搭子/鲸鱼工作台/assets/icons_backup")
    
    # 备份原图
    backup_dir.mkdir(exist_ok=True)
    
    png_files = sorted(icons_dir.glob("*.png"))
    print(f"找到 {len(png_files)} 个PNG图标文件")
    print("开始批量去除白边...\n")
    
    for png_path in png_files:
        # 备份
        backup_path = backup_dir / png_path.name
        if not backup_path.exists():
            img = Image.open(png_path)
            img.save(backup_path)
        
        # 处理（覆盖原文件）
        remove_white_border(png_path, png_path)
    
    print(f"\n全部处理完成！原图备份在: {backup_dir}")

if __name__ == "__main__":
    main()
