# encoding: UTF-8
# 신영싱크 붙박이장 자동 도면 (테스트 1)
#
# 실행 방법 (SketchUp 2026):
#   1. 이 파일을 PC에 저장 (예: C:/sinyoung/wardrobe_test.rb)
#   2. 스케치업 새 파일 열기 → 메뉴 [확장 프로그램(Extensions)] → [개발자(Developer)] → [Ruby 콘솔]
#   3. 콘솔에 아래 한 줄 입력 후 Enter
#        load "C:/sinyoung/wardrobe_test.rb"
#   4. 실행 취소(Ctrl+Z) 한 번이면 전체가 지워짐
#
# 아래 "입력값"만 바꾸면 다른 크기로 다시 그릴 수 있음 (단위 mm)

module SinyoungWardrobe
  # ===== 입력값 =====
  WIDTH     = 900    # 가로 W
  DEPTH     = 800    # 깊이 D (문짝 포함 전체 깊이)
  HEIGHT    = 2200   # 높이 H
  THICK     = 18     # 판재 두께 T
  DOORS     = 2      # 문짝 수 (좌우 여닫이)
  DOOR_GAP  = 2      # 문짝 사이 틈
  MATERIAL  = "실키클라우드"
  MAT_RGB   = [232, 230, 224]   # 화면 표시용 색 (실제 자재색과 다를 수 있음)
  QTY       = 1
  NOTE      = "양여닫이 #{DOORS}짝"
  # ==================

  def self.box(ents, name, x, y, z, w, d, h, mat)
    g = ents.add_group
    g.name = name
    pts = [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]].map { |p| p.map(&:mm) }
    face = g.entities.add_face(pts)
    face.reverse! if face.normal.z < 0
    face.pushpull(h.mm)
    g.material = mat
    g
  end

  def self.run
    model = Sketchup.active_model
    model.start_operation("붙박이장 그리기", true)

    # 치수를 900 처럼 mm 숫자로만 표시
    units = model.options["UnitsOptions"]
    units["LengthUnit"] = 4
    units["LengthFormat"] = 0
    units["LengthPrecision"] = 0
    units["SuppressUnitsDisplay"] = true

    mat = model.materials[MATERIAL] || model.materials.add(MATERIAL)
    mat.color = Sketchup::Color.new(*MAT_RGB)

    root = model.active_entities.add_group
    root.name = "붙박이장 #{WIDTH}x#{DEPTH}x#{HEIGHT}"
    ents = root.entities

    # 앞면이 y=0, 문짝은 앞쪽 THICK 만큼, 몸통은 그 뒤
    body_d = DEPTH - THICK
    inner_w = WIDTH - THICK * 2
    box(ents, "좌측판", 0, THICK, 0, THICK, body_d, HEIGHT, mat)
    box(ents, "우측판", WIDTH - THICK, THICK, 0, THICK, body_d, HEIGHT, mat)
    box(ents, "상판", THICK, THICK, HEIGHT - THICK, inner_w, body_d, THICK, mat)
    box(ents, "하판", THICK, THICK, 0, inner_w, body_d, THICK, mat)

    door_w = (WIDTH - DOOR_GAP * (DOORS - 1)).to_f / DOORS
    DOORS.times do |i|
      x = i * (door_w + DOOR_GAP)
      box(ents, "문짝#{i + 1}", x, 0, 0, door_w, THICK, HEIGHT, mat)
    end

    # 치수선
    ents.add_dimension_linear([0, 0, 0].map(&:mm), [WIDTH, 0, 0].map(&:mm), [0, -150.mm, 0])
    ents.add_dimension_linear([0, 0, 0].map(&:mm), [0, 0, HEIGHT].map(&:mm), [-150.mm, 0, 0])
    ents.add_dimension_linear([WIDTH, 0, 0].map(&:mm), [WIDTH, DEPTH, 0].map(&:mm), [150.mm, 0, 0])
    DOORS.times do |i|
      x = i * (door_w + DOOR_GAP)
      ents.add_dimension_linear([x, 0, HEIGHT].map(&:mm), [x + door_w, 0, HEIGHT].map(&:mm), [0, 0, 120.mm])
    end

    # 지시선 메모
    ents.add_text("#{MATERIAL}\n#{THICK}T #{NOTE}\n#{QTY}EA",
                  [WIDTH * 0.75, 0, HEIGHT * 0.5].map(&:mm),
                  [450.mm, -300.mm, 200.mm])

    model.commit_operation

    Sketchup.send_action("viewIso:")
    model.active_view.zoom_extents
  end
end

SinyoungWardrobe.run
