import { describe, it, expect } from 'vitest'
import { isDynamicClass, isDynamicId } from '../../scoring/dynamic-detector'

describe('isDynamicClass', () => {
  it('detects emotion css- prefix', () => {
    expect(isDynamicClass('css-1a2b3c')).toBe(true)
  })

  it('detects JSS jss prefix', () => {
    expect(isDynamicClass('jss42')).toBe(true)
  })

  it('detects styled-components sc- prefix', () => {
    expect(isDynamicClass('sc-abcdef1234')).toBe(true)
  })

  it('detects MUI Mui prefix', () => {
    expect(isDynamicClass('MuiButton-root')).toBe(true)
  })

  it('accepts static semantic class name', () => {
    expect(isDynamicClass('btn-primary')).toBe(false)
  })

  it('accepts short class name without dynamic pattern', () => {
    expect(isDynamicClass('active')).toBe(false)
  })
})

describe('isDynamicId', () => {
  it('detects UUID format', () => {
    expect(isDynamicId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('detects ember id pattern', () => {
    expect(isDynamicId('ember42')).toBe(true)
  })

  it('detects React portal id pattern (:r0:)', () => {
    expect(isDynamicId(':r0:')).toBe(true)
  })

  it('detects id with heavy numeric suffix', () => {
    expect(isDynamicId('widget-12345')).toBe(true)
  })

  it('accepts stable semantic id', () => {
    expect(isDynamicId('login-form')).toBe(false)
  })

  it('accepts short numeric suffix (1-2 digits)', () => {
    expect(isDynamicId('section-2')).toBe(false)
  })

  it('accepts simple word id', () => {
    expect(isDynamicId('email')).toBe(false)
  })

  it('detects high-entropy long id', () => {
    expect(isDynamicId('xQ9mZ2kPvRtYwNsA')).toBe(true)
  })

  // Boundary: digit-suffix threshold raised to 5+. Previously (3+) misclassified
  // semantic domain ids like BVD-135, order-1234, ticket-789 as dynamic.
  it('accepts 3-digit semantic id (BVD-135)', () => {
    expect(isDynamicId('BVD-135')).toBe(false)
  })

  it('accepts 3-digit ticket id', () => {
    expect(isDynamicId('ticket-789')).toBe(false)
  })

  it('accepts 4-digit order id', () => {
    expect(isDynamicId('order-1234')).toBe(false)
  })

  it('detects 5-digit suffix (boundary, dynamic)', () => {
    expect(isDynamicId('widget-12345')).toBe(true)
  })

  it('detects 6-digit suffix (dynamic)', () => {
    expect(isDynamicId('product-123456')).toBe(true)
  })

  it('detects compound numeric suffix when first group is 5+ digits', () => {
    expect(isDynamicId('row-12345-1')).toBe(true)
  })

  it('accepts compound numeric suffix when first group is short', () => {
    expect(isDynamicId('row-12-1')).toBe(false)
  })

  // Framework-internal IDs — structural fingerprint detection. These slip
  // past entropy + digit-count thresholds because the digit tail is short;
  // the surrounding shape is what makes them dynamic.
  describe('framework-internal auto-generated IDs', () => {
    it('detects Bootstrap Vue __BVID__N', () => {
      expect(isDynamicId('__BVID__517')).toBe(true)
    })

    it('detects Bootstrap Vue __BVID__N with 1 digit', () => {
      expect(isDynamicId('__BVID__1')).toBe(true)
    })

    it('detects Bootstrap Vue __BV_tab__N', () => {
      expect(isDynamicId('__BV_tab__1')).toBe(true)
    })

    it('detects Angular Material mat-input-N', () => {
      expect(isDynamicId('mat-input-3')).toBe(true)
    })

    it('detects MDC mdc-floating-label-N', () => {
      expect(isDynamicId('mdc-floating-label-12')).toBe(true)
    })

    it('detects Angular CDK cdk-overlay-N', () => {
      expect(isDynamicId('cdk-overlay-42')).toBe(true)
    })

    it('detects Vuetify v-input-N', () => {
      expect(isDynamicId('v-input-3')).toBe(true)
    })

    it('detects jQuery UI ui-id-N', () => {
      expect(isDynamicId('ui-id-42')).toBe(true)
    })

    it('detects Lit lit-element-N', () => {
      expect(isDynamicId('lit-element-3')).toBe(true)
    })

    it('detects bare prefix__N (no leading underscores)', () => {
      expect(isDynamicId('BVID__517')).toBe(true)
    })

    it('detects compound Bootstrap Vue tab button id (multiple prefixes joined)', () => {
      expect(isDynamicId('__BVID__27___BV_tab_button__')).toBe(true)
    })

    it('detects Bootstrap Vue id with BVID marker anywhere in the id', () => {
      expect(isDynamicId('my-component__BVID__42')).toBe(true)
    })

    it('detects ids with 3+ consecutive underscores as framework-generated', () => {
      expect(isDynamicId('component___internal__42')).toBe(true)
    })

    // Negative: snake_case semantic IDs must NOT trip the framework filter.
    it('keeps snake_case semantic IDs (single underscore separator)', () => {
      expect(isDynamicId('user_id_1')).toBe(false)
    })

    it('keeps snake_case private semantic IDs', () => {
      expect(isDynamicId('_private_field_2')).toBe(false)
    })

    it('keeps v-2 manual semantic id (no word between v and digits)', () => {
      expect(isDynamicId('v-2')).toBe(false)
    })
  })
})

describe('isDynamicClass — build-generated class families', () => {
  it.each([
    ['CSS Modules', 'Button_primary__3xZ2a'],
    ['CSS Modules (mixed case hash)', 'Header_nav__aB1cD'],
    ['Emotion styled', 'e1ie3l1u0'],
    ['Angular view encapsulation', 'ng-tns-c12-3'],
    ['Angular _ngcontent', '_ngcontent-abc-c12'],
    ['Angular _nghost', '_nghost-abc-c12'],
    ['Angular form state', 'ng-dirty'],
    ['Angular form state (touched)', 'ng-touched'],
    ['Svelte scoped', 'svelte-1x7k2ab'],
    ['styled-jsx', 'jsx-1234567890'],
  ])('flags %s (%s) as dynamic', (_family, cls) => {
    expect(isDynamicClass(cls)).toBe(true)
  })

  it.each([
    'card__title',
    'card__title--active',
    'btn_primary',
    'my_class__title',
    'nav-item',
    'error-message',
    'e2e-test',
    'ng-container',
    'svelte-icon',
    'jsx-icon',
  ])('keeps the hand-written class %s', (cls) => {
    expect(isDynamicClass(cls)).toBe(false)
  })
})
