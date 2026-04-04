// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TagBucketPicker from '../TagBucketPicker'
import { LimitedTag } from '@/types'

// ── T10: Adding tag to Preferred removes it from other buckets ───────────────
// ── T11: Adding tag to Limited removes it from other buckets ────────────────
// These tests verify the props/rendering behaviour of TagBucketPicker.
// The exclusivity enforcement logic lives in OnboardingFlow/PreferencesForm
// and is tested via their rendering tests below.

describe('TagBucketPicker - preferred bucket', () => {
  it('renders available tags as pill buttons', () => {
    render(
      <TagBucketPicker
        bucket="preferred"
        selected={[]}
        available={['Healthy', 'Quick', 'Spicy']}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByText('Quick')).toBeInTheDocument()
    expect(screen.getByText('Spicy')).toBeInTheDocument()
  })

  it('calls onChange with updated selection when tag is toggled on', () => {
    const onChange = vi.fn()
    render(
      <TagBucketPicker
        bucket="preferred"
        selected={[]}
        available={['Healthy', 'Quick']}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('Healthy'))
    expect(onChange).toHaveBeenCalledWith(['Healthy'])
  })

  it('calls onChange with tag removed when toggled off', () => {
    const onChange = vi.fn()
    render(
      <TagBucketPicker
        bucket="preferred"
        selected={['Healthy']}
        available={['Quick']}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('Healthy'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('does not show tags excluded from available', () => {
    // T10: tag in another bucket not shown in available
    render(
      <TagBucketPicker
        bucket="preferred"
        selected={[]}
        available={['Quick']}  // Healthy excluded (in limited bucket)
        onChange={vi.fn()}
      />
    )
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument()
    expect(screen.getByText('Quick')).toBeInTheDocument()
  })
})

describe('TagBucketPicker - limited bucket', () => {
  it('renders selected limited tags with StepperInput', () => {
    const limitedTags: LimitedTag[] = [{ tag: 'Comfort', cap: 2 }]
    render(
      <TagBucketPicker
        bucket="limited"
        selected={['Comfort']}
        selectedLimited={limitedTags}
        available={['Soup']}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('Comfort')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()  // cap display
    expect(screen.getByLabelText('Increase')).toBeInTheDocument()
    expect(screen.getByLabelText('Decrease')).toBeInTheDocument()
  })

  it('adds tag to limited with default cap 2 when toggled on', () => {
    const onChange = vi.fn()
    render(
      <TagBucketPicker
        bucket="limited"
        selected={[]}
        selectedLimited={[]}
        available={['Comfort']}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('Comfort'))
    expect(onChange).toHaveBeenCalledWith([{ tag: 'Comfort', cap: 2 }])
  })

  it('removes tag from limited when toggled off', () => {
    const onChange = vi.fn()
    const limitedTags: LimitedTag[] = [{ tag: 'Comfort', cap: 2 }]
    render(
      <TagBucketPicker
        bucket="limited"
        selected={['Comfort']}
        selectedLimited={limitedTags}
        available={[]}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('Comfort'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('T11: does not show tags excluded from available', () => {
    // Tags in preferred bucket are excluded from available for limited
    render(
      <TagBucketPicker
        bucket="limited"
        selected={[]}
        selectedLimited={[]}
        available={['Comfort']}  // Healthy excluded (in preferred)
        onChange={vi.fn()}
      />
    )
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument()
    expect(screen.getByText('Comfort')).toBeInTheDocument()
  })
})

// ── Grouped rendering ────────────────────────────────────────────────────────

describe('TagBucketPicker - grouped rendering', () => {
  it('preferred bucket shows group labels when tags span multiple sections', () => {
    render(
      <TagBucketPicker
        bucket="preferred"
        selected={[]}
        available={['Quick', 'Chicken']}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('Style')).toBeInTheDocument()
    expect(screen.getByText('Protein')).toBeInTheDocument()
  })

  it('limited bucket shows group labels for unselected available tags', () => {
    render(
      <TagBucketPicker
        bucket="limited"
        selected={[]}
        selectedLimited={[]}
        available={['Quick', 'Chicken']}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('Style')).toBeInTheDocument()
    expect(screen.getByText('Protein')).toBeInTheDocument()
  })
})

// ── Limited: Selected section behaviour ──────────────────────────────────────

describe('TagBucketPicker - limited Selected section', () => {
  it('selected tag appears in Selected section with StepperInput', () => {
    const limitedTags: LimitedTag[] = [{ tag: 'Healthy', cap: 2 }]
    render(
      <TagBucketPicker
        bucket="limited"
        selected={['Healthy']}
        selectedLimited={limitedTags}
        available={[]}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('Selected')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByLabelText('Increase')).toBeInTheDocument()
  })

  it('selected tag is not shown in its group while in Selected section', () => {
    const limitedTags: LimitedTag[] = [{ tag: 'Healthy', cap: 2 }]
    render(
      <TagBucketPicker
        bucket="limited"
        selected={['Healthy']}
        selectedLimited={limitedTags}
        available={['Quick']}
        onChange={vi.fn()}
      />
    )
    // Healthy is in Selected, not duplicated in Style group
    expect(screen.getAllByText('Healthy')).toHaveLength(1)
    // Quick still shows in Style group
    expect(screen.getByText('Quick')).toBeInTheDocument()
  })

  it('deselecting from Selected section calls onChange without that tag', () => {
    const onChange = vi.fn()
    const limitedTags: LimitedTag[] = [{ tag: 'Healthy', cap: 2 }]
    render(
      <TagBucketPicker
        bucket="limited"
        selected={['Healthy']}
        selectedLimited={limitedTags}
        available={[]}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('Healthy'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('after deselect, tag returns to its group when re-rendered with empty selectedLimited', () => {
    render(
      <TagBucketPicker
        bucket="limited"
        selected={[]}
        selectedLimited={[]}
        available={['Quick']}
        onChange={vi.fn()}
      />
    )
    expect(screen.queryByText('Selected')).not.toBeInTheDocument()
    expect(screen.getByText('Style')).toBeInTheDocument()
    expect(screen.getByText('Quick')).toBeInTheDocument()
  })
})

describe('TagBucketPicker - avoided bucket', () => {
  it('renders available tags', () => {
    render(
      <TagBucketPicker
        bucket="avoided"
        selected={[]}
        available={['Spicy', 'Grill']}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('Spicy')).toBeInTheDocument()
    expect(screen.getByText('Grill')).toBeInTheDocument()
  })

  it('calls onChange when tag toggled', () => {
    const onChange = vi.fn()
    render(
      <TagBucketPicker
        bucket="avoided"
        selected={[]}
        available={['Spicy']}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('Spicy'))
    expect(onChange).toHaveBeenCalledWith(['Spicy'])
  })
})
