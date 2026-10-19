-- Arte original del Santuario (losetas 16x16 y edificios), generado por código.
-- Ejecutar con Aseprite en modo batch:  pnpm arte:build
-- (equivale a: aseprite -b --script-param raiz=<carpeta del repo>/ --script tools/arte/santuario.lua)
-- Salida: apps/game/src/assets/santuario/*.png
-- Paleta: la del logo (azul noche, verde bosque, crema, gris azulado) más tonos de tierra y agua.
-- Los colores viven también en packs/comun/paleta.json; una prueba exige que coincidan.

local RAIZ = app.params and app.params["raiz"]
if not RAIZ or RAIZ == "" then
  error("Falta --script-param raiz=<carpeta del repo>/ (usa `pnpm arte:build`)")
end
if RAIZ:sub(-1) ~= "/" then RAIZ = RAIZ .. "/" end
local OUT = RAIZ .. "apps/game/src/assets/santuario/"
os.execute('mkdir -p "' .. OUT .. '"')

local function hex(h)
  return Color { r = tonumber(h:sub(2, 3), 16), g = tonumber(h:sub(4, 5), 16), b = tonumber(h:sub(6, 7), 16), a = 255 }
end
local CLARO = Color { r = 0, g = 0, b = 0, a = 0 }

-- Ruido determinista por coordenada y semilla (0..1).
local function ruido(x, y, s)
  local n = x * 374761393 + y * 668265263 + s * 2147483647
  n = (n ~ (n >> 13)) * 1274126177
  return ((n ~ (n >> 16)) & 0xffff) / 65535
end

local function px(img, x, y, c)
  if x >= 0 and y >= 0 and x < img.width and y < img.height then img:putPixel(x, y, c) end
end
local function rect(img, x, y, w, h, c)
  for j = 0, h - 1 do for i = 0, w - 1 do px(img, x + i, y + j, c) end end
end
local function elipse(img, cx, cy, rx, ry, c)
  for j = -ry, ry do
    for i = -rx, rx do
      if (i * i) / (rx * rx + 0.5) + (j * j) / (ry * ry + 0.5) <= 1 then px(img, cx + i, cy + j, c) end
    end
  end
end

local P = {
  noche = hex("#12122b"), noche2 = hex("#1b1b42"), noche3 = hex("#262660"),
  verde = hex("#2b6e49"), verde2 = hex("#3f9e5f"), verde0 = hex("#1f5236"), verde3 = hex("#67c77f"),
  crema = hex("#d9c89a"), crema2 = hex("#e8dcb6"), crema0 = hex("#b8a679"),
  gris = hex("#9aa0b8"), gris2 = hex("#6b7190"), gris0 = hex("#4a4f68"),
  tierra = hex("#4b3a2c"), tierra2 = hex("#5c4837"), tierra0 = hex("#3b2d22"),
  yerma = hex("#5a4f48"), yerma2 = hex("#6b5f55"), yerma0 = hex("#463d37"),
  agua = hex("#2b4f8c"), agua2 = hex("#3b6fb5"), agua3 = hex("#8fb8e8"), agua0 = hex("#203d6e"),
  madera = hex("#7a5232"), madera2 = hex("#9a6b40"), madera0 = hex("#573823"),
  luz = hex("#ffd866"), fruta = hex("#d9534f"),
}

-- ---------------------------------------------------------------- losetas
-- Tipos en el orden del juego: yerma, tierra, pradera, hierba-alta, agua, arena, roca, camino.
local TIPOS = { "yerma", "tierra", "pradera", "hierba-alta", "agua", "arena", "roca", "camino" }
local VARIANTES = 4

local function base(img, ox, oy, s, c0, c1, c2, umbralLuz, umbralOscuro)
  for j = 0, 15 do
    for i = 0, 15 do
      local r = ruido(i, j, s)
      local c = c0
      if r > umbralLuz then c = c1 elseif r < umbralOscuro then c = c2 end
      px(img, ox + i, oy + j, c)
    end
  end
end

local function loseta(img, tipo, v, ox, oy)
  local s = v * 17 + #tipo * 5
  if tipo == "yerma" then
    base(img, ox, oy, s, P.yerma, P.yerma2, P.yerma0, 0.86, 0.12)
    for k = 0, 2 do px(img, ox + math.floor(ruido(k, v, 3) * 14) + 1, oy + math.floor(ruido(v, k, 4) * 14) + 1, P.noche3) end
  elseif tipo == "tierra" then
    base(img, ox, oy, s, P.tierra, P.tierra2, P.tierra0, 0.84, 0.14)
  elseif tipo == "pradera" then
    base(img, ox, oy, s, P.verde, P.verde2, P.verde0, 0.88, 0.1)
    if v % 2 == 0 then px(img, ox + 4 + v, oy + 9, P.crema2); px(img, ox + 11 - v, oy + 4, P.luz) end
  elseif tipo == "hierba-alta" then
    base(img, ox, oy, s, P.verde0, P.verde, P.noche2, 0.9, 0.08)
    for k = 0, 4 do
      local x = 1 + math.floor(ruido(k, v, 9) * 13)
      local y = 5 + math.floor(ruido(v, k, 8) * 8)
      for d = 0, 3 do px(img, ox + x + (d > 2 and 1 or 0), oy + y - d, d == 3 and P.verde3 or P.verde2) end
    end
  elseif tipo == "agua" then
    base(img, ox, oy, s, P.agua, P.agua2, P.agua0, 0.9, 0.1)
    for k = 0, 1 do
      local y = 3 + k * 7 + (v % 2)
      local x = 1 + math.floor(ruido(k, v, 5) * 6)
      for d = 0, 4 do px(img, ox + x + d, oy + y, P.agua3) end
    end
  elseif tipo == "arena" then
    base(img, ox, oy, s, P.crema, P.crema2, P.crema0, 0.82, 0.16)
  elseif tipo == "roca" then
    base(img, ox, oy, s, P.gris2, P.gris, P.gris0, 0.85, 0.2)
    elipse(img, ox + 8, oy + 8, 6, 5, P.gris0)
    elipse(img, ox + 8, oy + 7, 5, 4, P.gris2)
    elipse(img, ox + 6, oy + 6, 2, 1, P.gris)
  elseif tipo == "camino" then
    base(img, ox, oy, s, P.crema0, P.crema, P.tierra2, 0.85, 0.1)
    for k = 0, 15 do px(img, ox + k, oy + 7, P.tierra2); px(img, ox + 7, oy + k, P.tierra2) end
  end
end

local function hacerLosetas()
  local img = Image(VARIANTES * 16, #TIPOS * 16)
  for t, tipo in ipairs(TIPOS) do
    for v = 0, VARIANTES - 1 do loseta(img, tipo, v, v * 16, (t - 1) * 16) end
  end
  img:saveAs(OUT .. "losetas.png")
end

-- --------------------------------------------------------------- edificios
local function nuevo(w, h) local i = Image(w, h); i:clear(CLARO); return i end

local function contorno(img, c)
  local copia = img:clone()
  for y = 0, img.height - 1 do
    for x = 0, img.width - 1 do
      if copia:getPixel(x, y) == 0 then
        local vecino = false
        for _, d in ipairs({ { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }) do
          local nx, ny = x + d[1], y + d[2]
          if nx >= 0 and ny >= 0 and nx < img.width and ny < img.height and copia:getPixel(nx, ny) ~= 0 then vecino = true end
        end
        if vecino then img:putPixel(x, y, c) end
      end
    end
  end
end

local function arbolCenit()
  local i = nuevo(48, 48)
  rect(i, 20, 24, 8, 20, P.madera); rect(i, 20, 24, 3, 20, P.madera2); rect(i, 26, 24, 2, 20, P.madera0)
  rect(i, 16, 42, 16, 3, P.madera0)
  elipse(i, 24, 16, 20, 14, P.verde0)
  elipse(i, 24, 14, 18, 12, P.verde)
  elipse(i, 20, 10, 9, 5, P.verde2)
  elipse(i, 31, 12, 6, 3, P.verde2)
  -- hueco luminoso del tronco
  elipse(i, 24, 33, 2, 4, P.noche)
  px(i, 24, 31, P.luz); px(i, 24, 32, P.luz); px(i, 24, 33, P.luz)
  for k = 0, 5 do px(i, 8 + math.floor(ruido(k, 1, 2) * 30), 8 + math.floor(ruido(2, k, 3) * 14), P.verde3) end
  contorno(i, P.noche)
  i:saveAs(OUT .. "arbol-cenit.png")
end

local function lechoHojas()
  local i = nuevo(16, 16)
  elipse(i, 8, 10, 7, 4, P.verde0)
  elipse(i, 8, 9, 6, 3, P.verde2)
  elipse(i, 8, 8, 4, 2, P.verde3)
  rect(i, 5, 7, 2, 1, P.crema2)
  contorno(i, P.noche)
  i:saveAs(OUT .. "lecho-hojas.png")
end

local function huertoBayas()
  local i = nuevo(32, 32)
  rect(i, 2, 8, 28, 22, P.tierra0)
  for f = 0, 2 do
    rect(i, 4, 11 + f * 7, 24, 4, P.tierra2)
    for k = 0, 4 do
      local x = 6 + k * 5
      px(i, x, 9 + f * 7, P.verde2); px(i, x, 10 + f * 7, P.verde); px(i, x - 1, 9 + f * 7, P.verde3)
      if (k + f) % 2 == 0 then px(i, x + 1, 10 + f * 7, P.fruta) end
    end
  end
  rect(i, 0, 6, 32, 2, P.madera); rect(i, 0, 29, 32, 2, P.madera)
  contorno(i, P.noche)
  i:saveAs(OUT .. "huerto-bayas.png")
end

local function aserradero()
  local i = nuevo(32, 32)
  rect(i, 3, 12, 22, 16, P.madera); rect(i, 3, 12, 22, 3, P.madera2)
  for k = 0, 5 do rect(i, 4 + k * 4, 15, 1, 13, P.madera0) end
  -- tejado
  for r = 0, 6 do rect(i, 1 + r, 6 + r, 26 - 2 * r, 1, r % 2 == 0 and P.tierra2 or P.tierra) end
  rect(i, 9, 20, 6, 8, P.noche2)
  -- pila de troncos
  for r = 0, 2 do for k = 0, 2 - r do elipse(i, 25 + k * 3 + r * 1, 27 - r * 3, 1, 1, P.madera2); px(i, 25 + k * 3 + r, 27 - r * 3, P.crema0) end end
  contorno(i, P.noche)
  i:saveAs(OUT .. "aserradero.png")
end

local function cantera()
  local i = nuevo(32, 32)
  elipse(i, 16, 20, 14, 9, P.gris0)
  elipse(i, 16, 19, 12, 7, P.noche3)
  elipse(i, 10, 14, 6, 4, P.gris2)
  elipse(i, 22, 15, 6, 4, P.gris)
  elipse(i, 14, 11, 3, 2, P.gris)
  for k = 0, 3 do px(i, 8 + k * 5, 22 + (k % 2), P.crema) end
  -- pico
  rect(i, 24, 20, 1, 8, P.madera); rect(i, 22, 19, 5, 1, P.gris)
  contorno(i, P.noche)
  i:saveAs(OUT .. "cantera.png")
end

local function almacen()
  local i = nuevo(32, 32)
  rect(i, 4, 14, 24, 14, P.madera2); rect(i, 4, 14, 24, 2, P.madera)
  for k = 0, 5 do rect(i, 5 + k * 4, 16, 1, 12, P.madera) end
  for r = 0, 6 do rect(i, 2 + r, 7 + r, 28 - 2 * r, 1, r % 2 == 0 and P.gris2 or P.gris0) end
  rect(i, 12, 20, 8, 8, P.madera0); rect(i, 15, 20, 2, 8, P.luz)
  rect(i, 6, 22, 4, 4, P.crema0); rect(i, 22, 22, 4, 4, P.crema0)
  contorno(i, P.noche)
  i:saveAs(OUT .. "almacen.png")
end


-- ------------------------------------------------------------ protagonista
-- Guardián de la Fisura: capa azul noche con capucha y un farol. Hoja de 16x16:
-- 3 filas (abajo, arriba, de lado) x 3 columnas (quieto, paso 1, paso 2).
-- La dirección izquierda es la de lado volteada en el juego.
local PIEL = hex("#e6b98c")
local SOMBRA = hex("#0a0a1a")

local function guardian(img, ox, oy, dir, f)
  local rebote = (f == 2) and -1 or 0
  elipse(img, ox + 8, oy + 14, 4, 1, SOMBRA)
  -- piernas
  local paso = (f == 1) and 1 or ((f == 2) and -1 or 0)
  rect(img, ox + 5, oy + 12 + (paso > 0 and 1 or 0), 2, 3 - (paso > 0 and 1 or 0), P.noche)
  rect(img, ox + 9, oy + 12 + (paso < 0 and 1 or 0), 2, 3 - (paso < 0 and 1 or 0), P.noche)
  -- capa
  rect(img, ox + 4, oy + 6 + rebote, 8, 7, P.noche3)
  rect(img, ox + 4, oy + 6 + rebote, 1, 7, P.noche2)
  rect(img, ox + 11, oy + 6 + rebote, 1, 7, P.noche2)
  px(img, ox + 4, oy + 13 + rebote, P.noche3); px(img, ox + 11, oy + 13 + rebote, P.noche3)
  rect(img, ox + 6, oy + 7 + rebote, 4, 1, P.gris2)   -- broche
  -- cabeza y capucha
  rect(img, ox + 5, oy + 2 + rebote, 6, 5, dir == "arriba" and P.noche3 or PIEL)
  rect(img, ox + 4, oy + 1 + rebote, 8, 3, P.noche3)
  rect(img, ox + 4, oy + 3 + rebote, 1, 4, P.noche3)
  rect(img, ox + 11, oy + 3 + rebote, 1, 4, P.noche3)
  rect(img, ox + 6, oy + 1 + rebote, 3, 1, P.noche2)
  if dir == "abajo" then
    px(img, ox + 6, oy + 5 + rebote, P.noche); px(img, ox + 9, oy + 5 + rebote, P.noche)
  elseif dir == "lado" then
    rect(img, ox + 3, oy + 3 + rebote, 3, 4, P.noche3)
    px(img, ox + 9, oy + 5 + rebote, P.noche)
  end
  -- farol
  local fx = (dir == "arriba") and ox + 2 or ox + 12
  rect(img, fx, oy + 9 + rebote, 2, 3, P.luz)
  px(img, fx, oy + 8 + rebote, P.gris2); px(img, fx + 1, oy + 8 + rebote, P.gris2)
  px(img, fx + 1, oy + 12 + rebote, P.crema2)
end

local function protagonista()
  local img = Image(48, 48)
  img:clear(CLARO)
  local dirs = { "abajo", "arriba", "lado" }
  for r, d in ipairs(dirs) do
    for f = 0, 2 do guardian(img, f * 16, (r - 1) * 16, d, f) end
  end
  img:saveAs(OUT .. "protagonista.png")
end

hacerLosetas()
protagonista()
arbolCenit(); lechoHojas(); huertoBayas(); aserradero(); cantera(); almacen()
print("arte del Santuario escrito en " .. OUT)
